from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from dotenv import load_dotenv

# Load root .env so ROBOFLOW_* and other API keys are available to backend
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

import math
import random
import time
from contextlib import asynccontextmanager, suppress
from dataclasses import asdict, dataclass, field
from typing import Any, Optional
from uuid import uuid4

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import DEFAULT_EXITS, DEFAULT_HAZARDS, NTU_CENTER_LAT, NTU_CENTER_LNG, SimulationConfig, WS_BROADCAST_INTERVAL_S, lat_lng_to_sector
from models.schemas import (
  Agent,
  Alert,
  ConfigUpdateRequest,
  EvacuationStartResponse,
  Exit,
  ExitStatusUpdateRequest,
  Hazard,
  HazardCreateRequest,
  HazardExternalCreateRequest,
  HeatmapCell,
  SensorOverrideRequest,
  SimFrame,
  StatsSnapshot
)
from routing.graph import CampusGraph, build_campus_graph
from routing.pathfinder import astar_distance_and_path
from config import AGENT_CLUSTER_CONFIG
from cctv import router as cctv_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("crowdsafe.backend")

EARTH_RADIUS_M = 6371000.0
QUEUE_CONGESTION_THRESHOLD = 0.9
HAZARD_EXIT_BLOCK_RADIUS_M = 40.0
ALERT_MAX_HISTORY = 250
DECISION_COMMIT_DISTANCE_M = 120.0


@dataclass
class SimAgentState:
  id: str
  lat: float
  lng: float
  sector: int
  speed_mps: float
  status: str = "normal"
  exit_target: Optional[str] = None
  path_eta_s: Optional[int] = None
  route_waypoints: list[tuple[float, float]] = field(default_factory=list)


active_connections: set[WebSocket] = set()
state_lock = asyncio.Lock()
frame_counter = 0
sim_config = SimulationConfig()
sensor_overrides: dict[str, float] = {}
hazards: list[Hazard] = [hazard.model_copy(deep=True) for hazard in DEFAULT_HAZARDS]
exits: list[Exit] = [exit_data.model_copy(deep=True) for exit_data in DEFAULT_EXITS]
alerts: list[Alert] = []
agents: list[SimAgentState] = []
evacuation_mode = False
broadcast_task: asyncio.Task[None] | None = None
campus_graph: CampusGraph | None = None


def distance_m(lat_a: float, lng_a: float, lat_b: float, lng_b: float) -> float:
  lat1 = math.radians(lat_a)
  lng1 = math.radians(lng_a)
  lat2 = math.radians(lat_b)
  lng2 = math.radians(lng_b)
  dlat = lat2 - lat1
  dlng = lng2 - lng1
  h = math.sin(dlat / 2.0) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2.0) ** 2
  return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(h))


def move_towards(lat: float, lng: float, target_lat: float, target_lng: float, step_m: float) -> tuple[float, float]:
  dist = distance_m(lat, lng, target_lat, target_lng)
  if dist <= 1e-6 or dist <= step_m:
    return target_lat, target_lng

  ratio = step_m / dist
  return lat + (target_lat - lat) * ratio, lng + (target_lng - lng) * ratio


def is_point_in_hazard(lat: float, lng: float, hazard_zone: Hazard) -> bool:
  return distance_m(lat, lng, hazard_zone.lat, hazard_zone.lng) <= hazard_zone.radius_m


def is_exit_hazard_blocked(exit_data: Exit) -> bool:
  for hazard_zone in hazards:
    if distance_m(exit_data.lat, exit_data.lng, hazard_zone.lat, hazard_zone.lng) <= max(
      HAZARD_EXIT_BLOCK_RADIUS_M,
      hazard_zone.radius_m * 0.6
    ):
      return True
  return False


def build_graph_from_exits() -> CampusGraph:
  exit_points = [(exit_data.lat, exit_data.lng) for exit_data in exits]
  return build_campus_graph(exit_points)


def get_exit_by_id(exit_id: Optional[str]) -> Optional[Exit]:
  if exit_id is None:
    return None
  return next((exit_data for exit_data in exits if exit_data.id == exit_id), None)


def is_exit_available(exit_data: Optional[Exit]) -> bool:
  if exit_data is None:
    return False
  if exit_data.status == "blocked":
    return False
  return not is_exit_hazard_blocked(exit_data)


def initialize_agents() -> None:
  rng = random.Random(42)
  agents.clear()

  base_count = int(AGENT_CLUSTER_CONFIG.get("agentCount", 1500))
  total_agents = max(100, int(base_count * sim_config.crowd_size_multiplier))
  areas = AGENT_CLUSTER_CONFIG.get("areas", [])
  total_weight = sum(float(area.get("weight", 0)) for area in areas) or 1.0

  def pick_area() -> dict[str, Any]:
    if not areas:
      return {"center": [NTU_CENTER_LNG, NTU_CENTER_LAT], "radiusM": 80, "name": "Default"}
    roll = rng.random()
    acc = 0.0
    for area in areas:
      acc += float(area.get("weight", 0)) / total_weight
      if roll <= acc:
        return area
    return areas[-1]

  for i in range(total_agents):
    area = pick_area()
    center_lng, center_lat = area.get("center", [NTU_CENTER_LNG, NTU_CENTER_LAT])
    radius_m = float(area.get("radiusM", 60))
    lat_jitter = radius_m / 110540.0
    lng_jitter = radius_m / (111320.0 * max(0.2, math.cos(math.radians(center_lat))))

    lat = center_lat + rng.uniform(-lat_jitter, lat_jitter)
    lng = center_lng + rng.uniform(-lng_jitter, lng_jitter)
    sector = lat_lng_to_sector(lat, lng)
    speed = max(0.7, sim_config.agent_speed_mps + rng.uniform(-0.3, 0.3))

    agents.append(
      SimAgentState(
        id=f"a{i + 1:04d}",
        lat=lat,
        lng=lng,
        sector=sector,
        speed_mps=speed
      )
    )


def route_cost_for_agent_exit(agent: SimAgentState, exit_data: Exit) -> tuple[float, list[tuple[float, float]]]:
  if campus_graph is None:
    direct = distance_m(agent.lat, agent.lng, exit_data.lat, exit_data.lng)
    return direct, [(exit_data.lat, exit_data.lng)]

  result = astar_distance_and_path(
    graph=campus_graph,
    start=(agent.lat, agent.lng),
    goal_node_id=exit_data.id,
    hazards=hazards
  )
  if result is None:
    return float("inf"), []

  dist_cost, polyline = result
  if len(polyline) <= 1:
    return dist_cost, [(exit_data.lat, exit_data.lng)]
  return dist_cost, polyline[1:]


def append_alert(reason: str, affected: int, old_exit: Optional[str] = None, new_exit: Optional[str] = None) -> None:
  alert = Alert(
    id=f"al_{uuid4().hex[:8]}",
    ts=int(time.time()),
    reason=reason,
    old_exit=old_exit,
    new_exit=new_exit,
    affected=max(0, affected)
  )
  alerts.append(alert)
  if len(alerts) > ALERT_MAX_HISTORY:
    del alerts[: len(alerts) - ALERT_MAX_HISTORY]


def reroute_agents(reason: str) -> int:
  transition_counts: dict[tuple[Optional[str], Optional[str]], int] = {}
  queue_projection: dict[str, int] = {exit_data.id: 0 for exit_data in exits}

  for exit_data in exits:
    if exit_data.status == "blocked" or is_exit_hazard_blocked(exit_data):
      queue_projection[exit_data.id] = max(exit_data.capacity, exit_data.queue)

  active_exits = [
    exit_data
    for exit_data in exits
    if exit_data.status != "blocked" and not is_exit_hazard_blocked(exit_data)
  ]

  if not active_exits:
    return 0

  affected = 0
  for agent in agents:
    if agent.status == "safe":
      continue

    current_exit = get_exit_by_id(agent.exit_target)
    if is_exit_available(current_exit):
      remaining = distance_m(agent.lat, agent.lng, current_exit.lat, current_exit.lng)
      if remaining <= DECISION_COMMIT_DISTANCE_M:
        queue_projection[current_exit.id] += 1
        agent.path_eta_s = int(remaining / max(0.8, agent.speed_mps))
        if not agent.route_waypoints:
          agent.route_waypoints = [(current_exit.lat, current_exit.lng)]
        if agent.status != "danger":
          agent.status = "evacuating"
        continue

    best_exit: Optional[Exit] = None
    best_score = float("inf")
    best_path: list[tuple[float, float]] = []

    for exit_data in active_exits:
      queue_ratio = queue_projection[exit_data.id] / max(1, exit_data.capacity)
      dist_cost, candidate_path = route_cost_for_agent_exit(agent, exit_data)
      if not candidate_path or math.isinf(dist_cost):
        continue

      crowd_penalty = 400.0 * queue_ratio
      status_penalty = 180.0 if exit_data.status == "congested" else 0.0
      score = dist_cost + crowd_penalty + status_penalty

      if score < best_score:
        best_score = score
        best_exit = exit_data
        best_path = candidate_path

    if best_exit is None or not best_path:
      continue

    queue_projection[best_exit.id] += 1

    old_exit = agent.exit_target
    new_exit = best_exit.id
    if old_exit != new_exit:
      affected += 1
      transition_counts[(old_exit, new_exit)] = transition_counts.get((old_exit, new_exit), 0) + 1

    agent.exit_target = new_exit
    agent.path_eta_s = int(best_score / max(0.8, agent.speed_mps))
    agent.route_waypoints = best_path
    if agent.status != "danger":
      agent.status = "evacuating"

  for idx, exit_data in enumerate(exits):
    next_queue = min(int(exit_data.capacity * 1.4), queue_projection.get(exit_data.id, 0))
    exits[idx] = exit_data.model_copy(update={"queue": next_queue})

  if affected > 0:
    dominant_transition = max(transition_counts.items(), key=lambda item: item[1])[0] if transition_counts else (None, None)
    append_alert(
      reason=reason,
      affected=affected,
      old_exit=dominant_transition[0],
      new_exit=dominant_transition[1]
    )

  return affected


def maybe_mark_congestion_and_reroute() -> None:
  congested_exits = []

  for idx, exit_data in enumerate(exits):
    queue_ratio = exit_data.queue / max(1, exit_data.capacity)
    next_status = exit_data.status

    if exit_data.status != "blocked":
      if queue_ratio >= QUEUE_CONGESTION_THRESHOLD:
        next_status = "congested"
      elif not exit_data.override:
        next_status = "open"

    if next_status != exit_data.status:
      exits[idx] = exit_data.model_copy(update={"status": next_status})

    if next_status == "congested":
      congested_exits.append(exit_data.id)

  if evacuation_mode and congested_exits:
    reroute_agents("exit_congested")


def update_agents_tick(dt_s: float) -> None:
  center_pull = 0.00002

  for agent in agents:
    if agent.status == "safe":
      continue

    in_hazard = any(is_point_in_hazard(agent.lat, agent.lng, hazard_zone) for hazard_zone in hazards)

    if evacuation_mode and agent.exit_target:
      target_exit = get_exit_by_id(agent.exit_target)
      if not is_exit_available(target_exit):
        continue

      step_m = max(0.2, agent.speed_mps * dt_s)
      if not agent.route_waypoints:
        agent.route_waypoints = [(target_exit.lat, target_exit.lng)]

      waypoint_lat, waypoint_lng = agent.route_waypoints[0]
      agent.lat, agent.lng = move_towards(agent.lat, agent.lng, waypoint_lat, waypoint_lng, step_m)

      if distance_m(agent.lat, agent.lng, waypoint_lat, waypoint_lng) <= 4.0 and len(agent.route_waypoints) > 1:
        agent.route_waypoints.pop(0)

      remaining_dist = 0.0
      cursor_lat, cursor_lng = agent.lat, agent.lng
      for next_lat, next_lng in agent.route_waypoints:
        remaining_dist += distance_m(cursor_lat, cursor_lng, next_lat, next_lng)
        cursor_lat, cursor_lng = next_lat, next_lng

      agent.path_eta_s = int(remaining_dist / max(0.8, agent.speed_mps))
      if remaining_dist <= 8.0:
        agent.status = "safe"
        agent.exit_target = None
        agent.path_eta_s = None
        agent.route_waypoints = []
      elif in_hazard:
        agent.status = "danger"
      else:
        agent.status = "evacuating"
    else:
      jitter_lat = random.uniform(-center_pull, center_pull)
      jitter_lng = random.uniform(-center_pull, center_pull)
      agent.lat = agent.lat + jitter_lat + (NTU_CENTER_LAT - agent.lat) * 0.0015
      agent.lng = agent.lng + jitter_lng + (NTU_CENTER_LNG - agent.lng) * 0.0015
      agent.status = "danger" if in_hazard else "normal"


def build_heatmap_cells() -> list[HeatmapCell]:
  if not agents:
    return []

  bins: dict[tuple[int, int], int] = {}
  for agent in agents:
    lat_bucket = int((agent.lat - (NTU_CENTER_LAT - 0.003)) / 0.00045)
    lng_bucket = int((agent.lng - (NTU_CENTER_LNG - 0.004)) / 0.00045)
    key = (lat_bucket, lng_bucket)
    bins[key] = bins.get(key, 0) + 1

  max_count = max(bins.values())
  cells: list[HeatmapCell] = []
  for (lat_bucket, lng_bucket), count in bins.items():
    cells.append(
      HeatmapCell(
        lat=(NTU_CENTER_LAT - 0.003) + lat_bucket * 0.00045,
        lng=(NTU_CENTER_LNG - 0.004) + lng_bucket * 0.00045,
        density=min(1.0, count / max(1, max_count))
      )
    )

  return cells


def build_frame(frame_id: int) -> SimFrame:
  return SimFrame(
    frame=frame_id,
    agents=[
      Agent(
        id=agent.id,
        lat=agent.lat,
        lng=agent.lng,
        status=agent.status,
        sector=agent.sector,
        exit_target=agent.exit_target,
        path_eta_s=agent.path_eta_s
      )
      for agent in agents
    ],
    heatmap_cells=build_heatmap_cells(),
    exits=[exit_data.model_copy(deep=True) for exit_data in exits],
    hazards=[hazard.model_copy(deep=True) for hazard in hazards],
    alerts=[alert.model_copy(deep=True) for alert in alerts]
  )


async def broadcast_frames() -> None:
  global frame_counter

  while True:
    await asyncio.sleep(WS_BROADCAST_INTERVAL_S)

    async with state_lock:
      frame_counter += 1
      update_agents_tick(WS_BROADCAST_INTERVAL_S)
      maybe_mark_congestion_and_reroute()
      payload = build_frame(frame_counter).model_dump()

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
  global broadcast_task, campus_graph
  logger.info("Starting CrowdSafe backend")
  campus_graph = build_graph_from_exits()
  initialize_agents()
  broadcast_task = asyncio.create_task(broadcast_frames())

  try:
    yield
  finally:
    if broadcast_task:
      broadcast_task.cancel()
      with suppress(asyncio.CancelledError):
        await broadcast_task
    logger.info("Shutting down CrowdSafe backend")


app = FastAPI(title="CrowdSafe API", version="0.3.0", lifespan=lifespan)

app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"]
)

app.include_router(cctv_router, prefix="/api")


class NotifyRequest(BaseModel):
  exit_id: str
  exit_name: Optional[str] = None


@app.post("/api/notify")
async def notify_attendees(payload: NotifyRequest) -> dict[str, str]:
  """Broadcast a redirect notification to all connected WebSocket clients (e.g. mobile)."""
  exit_name = payload.exit_name or payload.exit_id
  msg = {"type": "redirect", "exitId": payload.exit_id, "exitName": exit_name}
  stale: list[WebSocket] = []
  for ws in tuple(active_connections):
    try:
      await ws.send_json(msg)
    except Exception:
      stale.append(ws)
  for ws in stale:
    active_connections.discard(ws)
  logger.info("Notify broadcast: exit=%s, clients=%s", exit_name, len(active_connections))
  return {"status": "ok"}


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
    logger.info("WebSocket disconnected")
  finally:
    active_connections.discard(websocket)


@app.post("/config")
async def update_config(payload: ConfigUpdateRequest) -> dict[str, Any]:
  updates = payload.model_dump(exclude_none=True)
  async with state_lock:
    for key, value in updates.items():
      setattr(sim_config, key, value)

  return {"status": "ok", "config": asdict(sim_config)}


@app.post("/hazard", response_model=Hazard)
async def create_hazard(payload: HazardCreateRequest) -> Hazard:
  global evacuation_mode
  hazard = Hazard(id=f"h_{uuid4().hex[:8]}", **payload.model_dump())

  async with state_lock:
    hazards.append(hazard)
    evacuation_mode = True
    reroute_agents("hazard_added")

  return hazard


@app.post("/hazard/external", response_model=Hazard)
async def create_external_hazard(payload: HazardExternalCreateRequest) -> Hazard:
  global evacuation_mode
  hazard = Hazard(id=f"h_{uuid4().hex[:8]}", lat=payload.lat, lng=payload.lng, radius_m=65, type=payload.type)

  async with state_lock:
    hazards.append(hazard)
    evacuation_mode = True
    reroute_agents("hazard_external")

  return hazard


@app.delete("/hazard/{hazard_id}")
async def delete_hazard(hazard_id: str) -> dict[str, str]:
  async with state_lock:
    before = len(hazards)
    hazards[:] = [hazard for hazard in hazards if hazard.id != hazard_id]
    if len(hazards) == before:
      raise HTTPException(status_code=404, detail=f"Hazard '{hazard_id}' not found")

    reroute_agents("hazard_removed")

  return {"status": "ok"}


@app.post("/sensor-override")
async def sensor_override(payload: SensorOverrideRequest) -> dict[str, str]:
  async with state_lock:
    sensor_overrides[payload.gate_id] = payload.people_per_min
    sim_config.gate_overrides[payload.gate_id] = payload.people_per_min

  return {"status": "ok"}


@app.get("/sensor-override")
async def get_sensor_override() -> dict[str, dict[str, float]]:
  async with state_lock:
    return {"gate_overrides": dict(sensor_overrides)}


@app.post("/evacuation/start", response_model=EvacuationStartResponse)
async def start_evacuation() -> EvacuationStartResponse:
  global evacuation_mode
  async with state_lock:
    evacuation_mode = True
    affected = reroute_agents("evacuation_start")

  return EvacuationStartResponse(status="ok", evacuation_mode=evacuation_mode, affected_agents=affected)


@app.post("/exit/{exit_id}/status")
async def update_exit_status(exit_id: str, payload: ExitStatusUpdateRequest) -> dict[str, str]:
  async with state_lock:
    matched = False
    for index, exit_data in enumerate(exits):
      if exit_data.id == exit_id:
        exits[index] = exit_data.model_copy(update={"status": payload.status, "override": True})
        matched = True
        break

    if not matched:
      raise HTTPException(status_code=404, detail=f"Exit '{exit_id}' not found")

    reroute_agents("exit_status_changed")

  return {"status": "ok"}


@app.get("/stats/snapshot", response_model=StatsSnapshot)
async def stats_snapshot() -> StatsSnapshot:
  async with state_lock:
    total_population = len(agents)
    evacuated = sum(1 for agent in agents if agent.status == "safe")
    in_danger_zone = sum(1 for agent in agents if agent.status == "danger")
    eta_values = [agent.path_eta_s for agent in agents if agent.path_eta_s is not None and agent.status == "evacuating"]
    avg_eta_s = int(sum(eta_values) / len(eta_values)) if eta_values else 0
    busiest_exit = max(exits, key=lambda exit_data: exit_data.queue).id if exits else None

    return StatsSnapshot(
      total_population=total_population,
      evacuated=evacuated,
      in_danger_zone=in_danger_zone,
      avg_eta_s=avg_eta_s,
      busiest_exit=busiest_exit,
      active_hazards=len(hazards),
      frame=frame_counter
    )
