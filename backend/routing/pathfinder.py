from __future__ import annotations

import heapq
import math
from typing import Dict, List, Optional, Tuple

from models.schemas import Hazard
from routing.graph import CampusGraph, LatLng

EARTH_RADIUS_M = 6371000.0


def distance_m(a: LatLng, b: LatLng) -> float:
  lat1 = math.radians(a[0])
  lng1 = math.radians(a[1])
  lat2 = math.radians(b[0])
  lng2 = math.radians(b[1])
  dlat = lat2 - lat1
  dlng = lng2 - lng1
  h = math.sin(dlat / 2.0) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2.0) ** 2
  return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(h))


def _to_xy_m(point: LatLng, ref_lat: float) -> tuple[float, float]:
  x = point[1] * 111320.0 * math.cos(math.radians(ref_lat))
  y = point[0] * 110540.0
  return x, y


def _distance_point_to_segment_m(point: LatLng, a: LatLng, b: LatLng) -> float:
  ref_lat = (a[0] + b[0] + point[0]) / 3.0
  px, py = _to_xy_m(point, ref_lat)
  ax, ay = _to_xy_m(a, ref_lat)
  bx, by = _to_xy_m(b, ref_lat)

  abx = bx - ax
  aby = by - ay
  apx = px - ax
  apy = py - ay
  ab2 = abx * abx + aby * aby
  if ab2 <= 1e-6:
    return math.hypot(apx, apy)

  t = max(0.0, min(1.0, (apx * abx + apy * aby) / ab2))
  cx = ax + abx * t
  cy = ay + aby * t
  return math.hypot(px - cx, py - cy)


def edge_is_blocked(a: LatLng, b: LatLng, hazards: List[Hazard]) -> bool:
  for hazard in hazards:
    center = (hazard.lat, hazard.lng)
    if distance_m(a, center) <= hazard.radius_m:
      return True
    if distance_m(b, center) <= hazard.radius_m:
      return True
    if _distance_point_to_segment_m(center, a, b) <= hazard.radius_m:
      return True
  return False


def _nearest_nodes(graph: CampusGraph, point: LatLng, k: int = 3) -> List[str]:
  scored: List[Tuple[float, str]] = []
  for node_id, node in graph.nodes.items():
    if node_id.startswith("exit_"):
      continue
    d = distance_m(point, (node.lat, node.lng))
    scored.append((d, node_id))

  scored.sort(key=lambda item: item[0])
  return [node_id for _, node_id in scored[:k]]


def astar_distance_and_path(
  graph: CampusGraph,
  start: LatLng,
  goal_node_id: str,
  hazards: List[Hazard]
) -> Optional[Tuple[float, List[LatLng]]]:
  if goal_node_id not in graph.nodes:
    return None

  goal_node = graph.nodes[goal_node_id]
  goal = (goal_node.lat, goal_node.lng)
  start_nodes = _nearest_nodes(graph, start, k=4)
  if not start_nodes:
    return None

  frontier: List[Tuple[float, str]] = []
  g_cost: Dict[str, float] = {}
  parent: Dict[str, Optional[str]] = {}

  for node_id in start_nodes:
    node = graph.nodes[node_id]
    node_point = (node.lat, node.lng)
    if edge_is_blocked(start, node_point, hazards):
      continue
    start_cost = distance_m(start, node_point)
    g_cost[node_id] = start_cost
    parent[node_id] = None
    heapq.heappush(frontier, (start_cost + distance_m(node_point, goal), node_id))

  visited: set[str] = set()

  while frontier:
    _, node_id = heapq.heappop(frontier)
    if node_id in visited:
      continue
    visited.add(node_id)

    if node_id == goal_node_id:
      break

    node = graph.nodes[node_id]
    node_point = (node.lat, node.lng)

    for neigh_id in graph.neighbors(node_id):
      neigh = graph.nodes[neigh_id]
      neigh_point = (neigh.lat, neigh.lng)
      if edge_is_blocked(node_point, neigh_point, hazards):
        continue

      cand = g_cost[node_id] + distance_m(node_point, neigh_point)
      if cand < g_cost.get(neigh_id, float("inf")):
        g_cost[neigh_id] = cand
        parent[neigh_id] = node_id
        heapq.heappush(frontier, (cand + distance_m(neigh_point, goal), neigh_id))

  if goal_node_id not in g_cost:
    return None

  route_nodes: List[str] = []
  cursor: Optional[str] = goal_node_id
  while cursor is not None:
    route_nodes.append(cursor)
    cursor = parent.get(cursor)
  route_nodes.reverse()

  polyline: List[LatLng] = [start]
  for node_id in route_nodes:
    node = graph.nodes[node_id]
    polyline.append((node.lat, node.lng))

  return g_cost[goal_node_id], polyline
