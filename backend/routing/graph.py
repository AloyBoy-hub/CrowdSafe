from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List, Tuple

LatLng = Tuple[float, float]


@dataclass(frozen=True)
class GraphNode:
  id: str
  lat: float
  lng: float


@dataclass
class CampusGraph:
  nodes: Dict[str, GraphNode]
  adjacency: Dict[str, List[str]]

  def neighbors(self, node_id: str) -> Iterable[str]:
    return self.adjacency.get(node_id, [])


def build_campus_graph(exit_points: List[LatLng]) -> CampusGraph:
  # Lightweight graph skeleton around the demo area, stitched to dynamic exits.
  anchor_points: list[LatLng] = [
    (1.3440, 103.6788),
    (1.3445, 103.6794),
    (1.3449, 103.6800),
    (1.3454, 103.6807),
    (1.3458, 103.6814),
    (1.3463, 103.6821),
    (1.3468, 103.6828),
    (1.3473, 103.6835),
    (1.3478, 103.6842),
    (1.3474, 103.6830),
    (1.3469, 103.6823),
    (1.3463, 103.6816),
    (1.3457, 103.6809),
    (1.3451, 103.6802)
  ]

  nodes: Dict[str, GraphNode] = {}
  adjacency: Dict[str, List[str]] = {}

  def add_node(node_id: str, point: LatLng) -> None:
    nodes[node_id] = GraphNode(id=node_id, lat=point[0], lng=point[1])
    adjacency.setdefault(node_id, [])

  def connect(a: str, b: str) -> None:
    adjacency.setdefault(a, []).append(b)
    adjacency.setdefault(b, []).append(a)

  for idx, point in enumerate(anchor_points):
    add_node(f"a{idx}", point)

  for idx in range(len(anchor_points) - 1):
    connect(f"a{idx}", f"a{idx + 1}")

  for i, j in [(0, 4), (2, 6), (4, 8), (6, 10), (8, 12), (1, 7), (3, 9), (5, 11)]:
    connect(f"a{i}", f"a{j}")

  for idx, point in enumerate(exit_points):
    exit_node = f"exit_{idx + 1}"
    add_node(exit_node, point)

    distances = []
    for a_idx, anchor in enumerate(anchor_points):
      d = (anchor[0] - point[0]) ** 2 + (anchor[1] - point[1]) ** 2
      distances.append((d, f"a{a_idx}"))

    distances.sort(key=lambda item: item[0])
    for _, near_anchor in distances[:2]:
      connect(exit_node, near_anchor)

  return CampusGraph(nodes=nodes, adjacency=adjacency)
