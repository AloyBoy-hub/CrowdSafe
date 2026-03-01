from __future__ import annotations

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field

AgentStatus = Literal["normal", "evacuating", "safe", "danger"]
ExitStatus = Literal["open", "congested", "blocked"]
HazardType = Literal["fire", "smoke", "other"]


class Agent(BaseModel):
  id: str
  lat: float
  lng: float
  status: AgentStatus
  sector: int
  exit_target: Optional[str] = None
  path_eta_s: Optional[int] = None


class HeatmapCell(BaseModel):
  lat: float
  lng: float
  density: float = Field(ge=0.0, le=1.0)


class Exit(BaseModel):
  id: str
  lat: float
  lng: float
  capacity: int = Field(ge=1)
  queue: int = Field(ge=0)
  status: ExitStatus
  override: bool = False


class Hazard(BaseModel):
  id: str
  lat: float
  lng: float
  radius_m: float = Field(gt=0)
  type: HazardType


class Alert(BaseModel):
  id: str
  ts: int
  reason: str
  old_exit: Optional[str] = None
  new_exit: Optional[str] = None
  affected: int = Field(ge=0)


class SimFrame(BaseModel):
  frame: int = Field(ge=0)
  agents: List[Agent]
  heatmap_cells: List[HeatmapCell]
  exits: List[Exit]
  hazards: List[Hazard]
  alerts: List[Alert]


class ConfigUpdateRequest(BaseModel):
  agent_speed_mps: Optional[float] = Field(default=None, gt=0)
  crowd_size_multiplier: Optional[float] = Field(default=None, gt=0)
  sector_count: Optional[int] = Field(default=None, ge=1)
  simulation_hz: Optional[int] = Field(default=None, ge=1)
  gate_overrides: Optional[Dict[str, float]] = None


class HazardCreateRequest(BaseModel):
  lat: float
  lng: float
  radius_m: float = Field(gt=0)
  type: HazardType


class SensorOverrideRequest(BaseModel):
  gate_id: str
  people_per_min: float = Field(ge=0)


class ExitStatusUpdateRequest(BaseModel):
  status: ExitStatus

