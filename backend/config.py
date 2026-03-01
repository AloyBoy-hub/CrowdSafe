from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List

from models.schemas import Exit, Hazard

NTU_CENTER_LAT = 1.3483
NTU_CENTER_LNG = 103.6831
WS_BROADCAST_INTERVAL_S = 0.1


@dataclass
class SimulationConfig:
  agent_speed_mps: float = 1.4
  crowd_size_multiplier: float = 1.0
  sector_count: int = 4
  simulation_hz: int = 10
  gate_overrides: Dict[str, float] = field(default_factory=dict)


DEFAULT_EXITS: List[Exit] = [
  Exit(
    id="main_gate",
    lat=1.3462,
    lng=103.6814,
    capacity=500,
    queue=140,
    status="open",
    override=False
  ),
  Exit(
    id="north_gate",
    lat=1.3502,
    lng=103.6857,
    capacity=350,
    queue=90,
    status="open",
    override=False
  )
]

DEFAULT_HAZARDS: List[Hazard] = [
  Hazard(id="h_bootstrap", lat=1.3488, lng=103.684, radius_m=50, type="fire")
]

