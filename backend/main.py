from __future__ import annotations

import asyncio
import logging
import math
import time
from contextlib import asynccontextmanager, suppress
from dataclasses import asdict
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from config import (
  DEFAULT_EXITS,
  DEFAULT_HAZARDS,
  NTU_CENTER_LAT,
  NTU_CENTER_LNG,
  SimulationConfig,
  WS_BROADCAST_INTERVAL_S
)
from models.schemas import (
  Agent,
  Alert,
  ConfigUpdateRequest,
  Exit,
  ExitStatusUpdateRequest,
  Hazard,
  HazardCreateRequest,
  HeatmapCell,
  SensorOverrideRequest,
  SimFrame
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("crowdsafe.backend")

active_connections: set[WebSocket] = set()
state_lock = asyncio.Lock()
frame_counter = 0
sim_config = SimulationConfig()
sensor_overrides: dict[str, float] = {}
hazards: list[Hazard] = [hazard.model_copy(deep=True) for hazard in DEFAULT_HAZARDS]
exits: list[Exit] = [exit_data.model_copy(deep=True) for exit_data in DEFAULT_EXITS]
alerts: list[Alert] = []
broadcast_task: asyncio.Task[None] | None = None


def build_mock_frame(frame_id: int) -> SimFrame:
  phase = frame_id / 8.0

  mock_agents = [
    Agent(
      id="a001",
      lat=NTU_CENTER_LAT + 0.00025 * math.sin(phase),
      lng=NTU_CENTER_LNG + 0.0002 * math.cos(phase),
      status="evacuating",
      sector=1,
      exit_target="main_gate",
      path_eta_s=87
    ),
    Agent(
      id="a002",
      lat=NTU_CENTER_LAT - 0.0002 * math.cos(phase * 1.2),
      lng=NTU_CENTER_LNG + 0.00022 * math.sin(phase * 1.2),
      status="normal",
      sector=2,
      exit_target=None,
      path_eta_s=None
    ),
    Agent(
      id="a003",
      lat=NTU_CENTER_LAT + 0.0003 * math.sin(phase * 0.7),
      lng=NTU_CENTER_LNG - 0.00025 * math.cos(phase * 0.7),
      status="danger",
      sector=3,
      exit_target="north_gate",
      path_eta_s=132
    )
  ]

  frame_exits: list[Exit] = []
  for index, exit_data in enumerate(exits):
    dynamic_queue = int(
      max(
        0,
        min(
          exit_data.capacity,
          exit_data.queue + 12 * math.sin((frame_id / 10.0) + index)
        )
      )
    )
    frame_exits.append(exit_data.model_copy(update={"queue": dynamic_queue}))

  frame_heatmap = [
    HeatmapCell(lat=NTU_CENTER_LAT + 0.0002, lng=NTU_CENTER_LNG + 0.0001, density=0.73),
    HeatmapCell(lat=NTU_CENTER_LAT - 0.00015, lng=NTU_CENTER_LNG - 0.0002, density=0.41)
  ]

  frame_alerts = [alert.model_copy(deep=True) for alert in alerts]
  frame_hazards = [hazard.model_copy(deep=True) for hazard in hazards]

  return SimFrame(
    frame=frame_id,
    agents=mock_agents,
    heatmap_cells=frame_heatmap,
    exits=frame_exits,
    hazards=frame_hazards,
    alerts=frame_alerts
  )


async def broadcast_frames() -> None:
  global frame_counter

  while True:
    await asyncio.sleep(WS_BROADCAST_INTERVAL_S)

    async with state_lock:
      frame_counter += 1
      payload = build_mock_frame(frame_counter).model_dump()
      alerts.clear()

    if not active_connections:
      continue

    stale_connections: list[WebSocket] = []
    for websocket in tuple(active_connections):
      try:
        await websocket.send_json(payload)
      except Exception:
        stale_connections.append(websocket)

    for websocket in stale_connections:
      active_connections.discard(websocket)


@asynccontextmanager
async def lifespan(_app: FastAPI):
  global broadcast_task
  logger.info("Starting CrowdSafe backend")
  broadcast_task = asyncio.create_task(broadcast_frames())

  try:
    yield
  finally:
    if broadcast_task:
      broadcast_task.cancel()
      with suppress(asyncio.CancelledError):
        await broadcast_task
    logger.info("Shutting down CrowdSafe backend")


app = FastAPI(title="CrowdSafe API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"]
)


@app.get("/health")
async def health() -> dict[str, str]:
  return {"status": "ok"}


@app.websocket("/ws")
async def websocket_frames(websocket: WebSocket) -> None:
  await websocket.accept()
  active_connections.add(websocket)
  logger.info("WebSocket connected. total_clients=%s", len(active_connections))

  try:
    while True:
      await websocket.receive_text()
  except WebSocketDisconnect:
    logger.info("WebSocket disconnected.")
  finally:
    active_connections.discard(websocket)


@app.post("/config")
async def update_config(payload: ConfigUpdateRequest) -> dict[str, Any]:
  updates = payload.model_dump(exclude_none=True)
  logger.info("Config update received: %s", updates)

  async with state_lock:
    for key, value in updates.items():
      setattr(sim_config, key, value)

  return {"status": "ok", "config": asdict(sim_config)}


@app.post("/hazard", response_model=Hazard)
async def create_hazard(payload: HazardCreateRequest) -> Hazard:
  hazard = Hazard(id=f"h_{uuid4().hex[:8]}", **payload.model_dump())
  logger.info("Hazard created: %s", hazard.model_dump())

  async with state_lock:
    hazards.append(hazard)

  return hazard


@app.post("/sensor-override")
async def sensor_override(payload: SensorOverrideRequest) -> dict[str, str]:
  logger.info(
    "Sensor override received: gate_id=%s people_per_min=%s",
    payload.gate_id,
    payload.people_per_min
  )

  async with state_lock:
    sensor_overrides[payload.gate_id] = payload.people_per_min
    sim_config.gate_overrides[payload.gate_id] = payload.people_per_min

  return {"status": "ok"}


@app.post("/exit/{exit_id}/status")
async def update_exit_status(exit_id: str, payload: ExitStatusUpdateRequest) -> dict[str, str]:
  logger.info("Exit status update received: exit_id=%s status=%s", exit_id, payload.status)

  async with state_lock:
    matched = False
    for index, exit_data in enumerate(exits):
      if exit_data.id == exit_id:
        exits[index] = exit_data.model_copy(update={"status": payload.status, "override": True})
        matched = True
        break

    if not matched:
      raise HTTPException(status_code=404, detail=f"Exit '{exit_id}' not found")

    alerts.append(
      Alert(
        id=f"al_{uuid4().hex[:8]}",
        ts=int(time.time()),
        reason="exit_override",
        old_exit=exit_id,
        new_exit=exit_id,
        affected=0
      )
    )

  return {"status": "ok"}

