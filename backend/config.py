from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List
import math

from models.schemas import Exit, Hazard

NTU_CENTER_LAT = 1.3483
NTU_CENTER_LNG = 103.6831
WS_BROADCAST_INTERVAL_S = 0.1

# Sectors: 0=North, 1=East, 2=South, 3=West (cardinal wedges around campus center)
def lat_lng_to_sector(lat: float, lng: float) -> int:
  """
  Assign a cardinal sector based on the bearing from the campus center.

  0: North  (45°–135°)
  1: East   (315°–360° and 0°–45°)
  2: South  (225°–315°)
  3: West   (135°–225°)
  """
  dy = lat - NTU_CENTER_LAT
  dx = lng - NTU_CENTER_LNG
  if dx == 0 and dy == 0:
    return 0

  angle_rad = math.atan2(dy, dx)  # 0 along +x (east), pi/2 along +y (north)
  angle_deg = (math.degrees(angle_rad) + 360.0) % 360.0

  if 45.0 <= angle_deg < 135.0:
    return 0  # North
  if 135.0 <= angle_deg < 225.0:
    return 3  # West
  if 225.0 <= angle_deg < 315.0:
    return 2  # South
  return 1  # East

AGENT_CLUSTER_CONFIG = {
  "agentCount": 1500,
  "areas": [
    {"name": "The Quad", "center": [103.6799935, 1.3448016], "weight": 0.35, "radiusM": 55},
    {"name": "Spruce Bistro", "center": [103.6797993, 1.3447277], "weight": 0.25, "radiusM": 45},
    {"name": "Coffee Faculty", "center": [103.6792830, 1.3446814], "weight": 0.40, "radiusM": 40}
  ]
}


@dataclass
class SimulationConfig:
  agent_speed_mps: float = 1.4
  crowd_size_multiplier: float = 1.0
  sector_count: int = 4
  simulation_hz: int = 10
  gate_overrides: Dict[str, float] = field(default_factory=dict)


DEFAULT_EXITS: List[Exit] = [
  Exit(
    id="exit_1",
    lat=1.3447963,
    lng=103.68037,
    capacity=520,
    queue=160,
    status="open",
    override=False
  ),
  Exit(
    id="exit_2",
    lat=1.3445734,
    lng=103.6797783,
    capacity=430,
    queue=120,
    status="open",
    override=False
  ),
  Exit(
    id="exit_3",
    lat=1.344602,
    lng=103.6789549,
    capacity=360,
    queue=105,
    status="open",
    override=False
  )
]

DEFAULT_HAZARDS: List[Hazard] = []
