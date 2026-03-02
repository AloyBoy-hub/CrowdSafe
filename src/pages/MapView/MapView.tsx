import { LineLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import { MapboxOverlay } from "@deck.gl/mapbox";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Layers,
  Map as MapIcon,
  Moon,
  Shield,
  Sun,
  TriangleAlert,
  Users,
  X
} from "lucide-react";
import mapboxgl, { type MapLayerMouseEvent, type Marker } from "mapbox-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Agent as SimAgent, Alert as SimAlert, Exit as SimExit, Hazard as SimHazard } from "../../lib/types";
import {
  CAMERA_DEFAULT_BEARING,
  CAMERA_DEFAULT_PITCH,
  CAMERA_DEFAULT_ZOOM,
  CAMERA_MAX_ZOOM,
  CAMERA_MIN_ZOOM,
  EXIT_POINTS,
  OUTDOOR_STANDARD_STYLE,
  OUTDOOR_STREETS_STYLE,
  VENUE_BOUNDS_NE,
  VENUE_BOUNDS_SW,
  VENUE_CENTER,
  getMapboxToken
} from "../../lib/mapConfig";
import {
  GlassCard,
  GlassCardContent,
  GlassCardDescription,
  GlassCardHeader,
  GlassCardTitle
} from "../../components/ui/glass-card";
import { Glass } from "../../components/ui/glass-effect";
import { GlassButton, GlassEffect, GlassFilter } from "../../components/ui/liquid-glass";
import { useSimStore } from "../../store/useSimStore";

type LngLat = [number, number];
type MapVariant = "2d" | "3d";

interface Agent {
  id: string;
  position: [number, number];
  sector: string;
  speed: number;
  path: [number, number][];
}

interface AgentStatusCounts {
  normal: number;
  evacuating: number;
  safe: number;
  danger: number;
}

interface LayerSettings {
  showAgents: boolean;
  showHeatmap: boolean;
  showSafetyStatus: boolean;
  showEvacuationZones: boolean;
}

interface Hazard {
  id: string;
  lat: number;
  lng: number;
  radiusM: number;
  type: "fire" | "smoke" | "other";
}

interface HazardDynamics {
  effectiveRadiusM: number;
  nextExpandAtMs: number;
}

const AGENT_COUNT = 1500;
const STEP_MS = 100;
const HEATMAP_MS = 500;
const UI_MS = 1000;
const HAZARD_INITIAL_RADIUS_MULTIPLIER = 1.2;
const HAZARD_SPREAD_INTERVAL_MS = 1500;
const HAZARD_SPREAD_INCREMENT_M = 5;
const HAZARD_MAX_RADIUS_M = 175;
const HAZARD_ESCAPE_BUFFER_M = 3;
const EXIT_LOAD_RADIUS_M = 25;
const EXIT_LOAD_BASELINE = 150;
const EXIT_CONGESTED_THRESHOLD = 0.8;
const EXIT_HIGH_CONGESTION_BAND_PCT = 85;
const CONGESTED_INITIAL_REROUTE_RATIO = 0.2;
const CONGESTED_RECHECK_REROUTE_RATIO = 0.1;
const CONGESTED_RECHECK_MS = 20_000;
const SPAWN_TO_EXIT_SPEED_MIN = 4.0;
const SPAWN_TO_EXIT_SPEED_MAX = 5.0;
const EXIT_TO_DISPERSAL_SPEED_MIN = 1.5;
const EXIT_TO_DISPERSAL_SPEED_MAX = 2.5;
const NORMAL_ROAM_SPEED_MIN = 0.8;
const NORMAL_ROAM_SPEED_MAX = 1.4;
const STORE_SYNC_MS = 250;
const EXIT_FLOW_WINDOW_MS = 60_000;
const EXIT_FLOW_CAPTURE_RADIUS_M = 7.5;
const EXIT_FLOW_CAP_PPM = 160;
const EXIT_APPROACH_RADIUS_M = 10;
const EVAC_STATE_NORMAL = 0;
const EVAC_STATE_EXITING = 1;
const EVAC_STATE_SAFE = 2;
const EVAC_STATE_ESCAPING = 3;

const SPAWN_POLYGON: LngLat[] = [
  [103.8735782, 1.3037275],
  [103.8733984, 1.3046189],
  [103.8739464, 1.305382],
  [103.8747252, 1.3054516],
  [103.875441, 1.3049481],
  [103.8753636, 1.3041827],
  [103.8747054, 1.3034892],
  [103.8735782, 1.3037275]
];

const DISPERSAL_POLYGONS: LngLat[][] = [
  [
    [103.8747054, 1.3034892],
    [103.8755436, 1.3034007],
    [103.8743923, 1.3029332],
    [103.8747054, 1.3034892]
  ],
  [
    [103.875441, 1.3049481],
    [103.8762038, 1.3047105],
    [103.8755007, 1.3057633],
    [103.875441, 1.3049481]
  ],
  [
    [103.8733984, 1.3046189],
    [103.872833, 1.304689],
    [103.8732606, 1.3053348],
    [103.8733984, 1.3046189]
  ]
];

const EXIT_TO_DISPERSAL_INDEX: Record<string, number> = {
  exit_1: 0,
  exit_2: 1,
  exit_3: 2
};

const ALL_SIM_POINTS: LngLat[] = [
  ...SPAWN_POLYGON,
  ...EXIT_POINTS.map((x) => x.coordinate as LngLat),
  ...DISPERSAL_POLYGONS.flat()
];

const SIM_BOUNDS = {
  west: Math.min(VENUE_BOUNDS_SW[0], ...ALL_SIM_POINTS.map((x) => x[0])) - 0.0002,
  east: Math.max(VENUE_BOUNDS_NE[0], ...ALL_SIM_POINTS.map((x) => x[0])) + 0.0002,
  south: Math.min(VENUE_BOUNDS_SW[1], ...ALL_SIM_POINTS.map((x) => x[1])) - 0.0002,
  north: Math.max(VENUE_BOUNDS_NE[1], VENUE_CENTER[1], ...ALL_SIM_POINTS.map((x) => x[1])) + 0.0002
};

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp([lng, lat]: LngLat): LngLat {
  return [Math.max(SIM_BOUNDS.west, Math.min(SIM_BOUNDS.east, lng)), Math.max(SIM_BOUNDS.south, Math.min(SIM_BOUNDS.north, lat))];
}

function distM(a: LngLat, b: LngLat): number {
  const avg = ((a[1] + b[1]) * 0.5 * Math.PI) / 180;
  const dx = (b[0] - a[0]) * 111320 * Math.cos(avg);
  const dy = (b[1] - a[1]) * 110540;
  return Math.sqrt(dx * dx + dy * dy);
}

function pointInPolygon(point: LngLat, polygon: LngLat[]): boolean {
  let inside = false;
  const x = point[0];
  const y = point[1];
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function stripClosedRing(polygon: LngLat[]): LngLat[] {
  if (polygon.length < 2) return polygon;
  const first = polygon[0];
  const last = polygon[polygon.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return polygon.slice(0, -1);
  return polygon;
}

function samplePointInTriangle(a: LngLat, b: LngLat, c: LngLat): LngLat {
  // Uniform sampling over triangle area (barycentric)
  const r1 = Math.random();
  const r2 = Math.random();
  const s = Math.sqrt(r1);
  const u = 1 - s;
  const v = s * (1 - r2);
  const w = s * r2;
  return [
    u * a[0] + v * b[0] + w * c[0],
    u * a[1] + v * b[1] + w * c[1]
  ];
}

function polygonBounds(polygon: LngLat[]): { west: number; east: number; south: number; north: number } {
  return {
    west: Math.min(...polygon.map((p) => p[0])),
    east: Math.max(...polygon.map((p) => p[0])),
    south: Math.min(...polygon.map((p) => p[1])),
    north: Math.max(...polygon.map((p) => p[1]))
  };
}

function samplePointInPolygon(polygon: LngLat[]): LngLat {
  const ring = stripClosedRing(polygon);
  if (ring.length === 3) {
    return samplePointInTriangle(ring[0], ring[1], ring[2]);
  }

  const b = polygonBounds(ring);
  for (let i = 0; i < 800; i += 1) {
    const candidate: LngLat = [rand(b.west, b.east), rand(b.south, b.north)];
    if (pointInPolygon(candidate, ring)) return candidate;
  }

  // Stable fallback to polygon centroid if rejection sampling fails.
  let sumLng = 0;
  let sumLat = 0;
  for (const p of ring) {
    sumLng += p[0];
    sumLat += p[1];
  }
  return [sumLng / Math.max(1, ring.length), sumLat / Math.max(1, ring.length)];
}

function offsetByMeters(origin: LngLat, eastM: number, northM: number): LngLat {
  const latDelta = northM / 110540;
  const lngDelta = eastM / (111320 * Math.max(0.2, Math.cos((origin[1] * Math.PI) / 180)));
  return [origin[0] + lngDelta, origin[1] + latDelta];
}

function hazardPolygon(lat: number, lng: number, radiusM: number): LngLat[] {
  const points: LngLat[] = [];
  const steps = 48;
  for (let i = 0; i <= steps; i += 1) {
    const theta = (i / steps) * Math.PI * 2;
    const latOffset = (radiusM / 110540) * Math.sin(theta);
    const lngOffset = (radiusM / (111320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)))) * Math.cos(theta);
    points.push([lng + lngOffset, lat + latOffset]);
  }
  return points;
}

function evacuationSpeedBandByFlowPpm(flowPpm: number): [number, number] {
  if (flowPpm <= 96) return [1.4, 1.6];
  if (flowPpm <= 136) return [1.1, 1.4];
  return [0.7, 1.1];
}

function outdoorStyle(v: MapVariant): string {
  return v === "3d" ? OUTDOOR_STANDARD_STYLE : OUTDOOR_STREETS_STYLE;
}

export default function MapView() {
  const navigate = useNavigate();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const deckRef = useRef<MapboxOverlay | null>(null);
  const mapMarkersRef = useRef<Marker[]>([]);
  const selectedIndexRef = useRef<number | null>(null);
  const layersRef = useRef<LayerSettings>({
    showAgents: true,
    showHeatmap: true,
    showSafetyStatus: true,
    showEvacuationZones: true
  });
  const variantRef = useRef<MapVariant>("2d");
  const posVerRef = useRef(0);

  const idsRef = useRef<string[]>(Array.from({ length: AGENT_COUNT }, (_, i) => `AGT-${String(i + 1).padStart(4, "0")}`));
  const sectorsRef = useRef<string[]>(Array.from({ length: AGENT_COUNT }, () => "Spawn Area"));
  const positionsRef = useRef<Float64Array>(new Float64Array(AGENT_COUNT * 2));
  const speedsRef = useRef<Float64Array>(new Float64Array(AGENT_COUNT));
  const pathsRef = useRef<LngLat[][]>(Array.from({ length: AGENT_COUNT }, () => []));
  const evacuationStateRef = useRef<Uint8Array>(new Uint8Array(AGENT_COUNT));
  const wasInHazardRef = useRef<Uint8Array>(new Uint8Array(AGENT_COUNT));
  const flowCountedExitRef = useRef<Int16Array>(new Int16Array(AGENT_COUNT));
  const exitFlowEventsRef = useRef<number[][]>(Array.from({ length: EXIT_POINTS.length }, () => []));
  const congestedRerouteAtMsRef = useRef<number[]>(Array.from({ length: EXIT_POINTS.length }, () => 0));
  const exitTargetIndexRef = useRef<number[]>(Array.from({ length: AGENT_COUNT }, () => -1));
  const evacuationStartedAtMsRef = useRef<Float64Array>(new Float64Array(AGENT_COUNT));
  const evacuationCompletedAtMsRef = useRef<Float64Array>(new Float64Array(AGENT_COUNT));
  const evacuationDurationSRef = useRef<Float64Array>(new Float64Array(AGENT_COUNT));
  const hazardDynamicsRef = useRef<Map<string, HazardDynamics>>(new Map());
  const frameRef = useRef(0);
  const exitsRef = useRef<SimExit[]>(
    EXIT_POINTS.map((exit) => ({
      id: exit.id,
      name: exit.label,
      lat: exit.coordinate[1],
      lng: exit.coordinate[0],
      queue: 0,
      flow_ppm: 0,
      status: "open",
      override: false
    }))
  );

  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("campuswatch-dark-mode") !== "light");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("campuswatch-sidebar-collapsed") === "true");
  const [variant, setVariant] = useState<MapVariant>("2d");
  const [layerSettings, setLayerSettings] = useState<LayerSettings>({
    showAgents: true,
    showHeatmap: true,
    showSafetyStatus: true,
    showEvacuationZones: true
  });
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [heatmapRev, setHeatmapRev] = useState(0);
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const hazardsRef = useRef<Hazard[]>([]);
  const [placeHazardMode, setPlaceHazardMode] = useState(false);
  const [hazardRadius, setHazardRadius] = useState(50);
  const [hazardMessage, setHazardMessage] = useState("Idle");
  const [statusCounts, setStatusCounts] = useState<AgentStatusCounts>({
    normal: AGENT_COUNT,
    evacuating: 0,
    safe: 0,
    danger: 0
  });
  const placeHazardModeRef = useRef(false);
  const hazardRadiusRef = useRef(50);
  const setAgentsStore = useSimStore((state) => state.setAgents);
  const setExitsStore = useSimStore((state) => state.setExits);
  const setHazardsStore = useSimStore((state) => state.setHazards);
  const setAlertsStore = useSimStore((state) => state.setAlerts);
  const storeExits = useSimStore((state) => state.exits);

  function toggleLayer(key: keyof LayerSettings): void {
    setLayerSettings((prev) => {
      // Agent-derived layers are disabled when agent dots are off.
      if (!prev.showAgents && key !== "showAgents" && key !== "showEvacuationZones") return prev;

      if (key === "showAgents") {
        const nextShowAgents = !prev.showAgents;
        if (!nextShowAgents) {
          return {
            ...prev,
            showAgents: false,
            showHeatmap: false,
            showSafetyStatus: false
          };
        }
        return {
          ...prev,
          showAgents: true
        };
      }

      return {
        ...prev,
        [key]: !prev[key]
      };
    });
  }

  function appendAlert(alert: SimAlert): void {
    const current = useSimStore.getState().alerts;
    setAlertsStore([alert, ...current].slice(0, 120));
  }

  function markEvacuationStart(agentIndex: number, nowMs = Date.now()): void {
    if (evacuationStartedAtMsRef.current[agentIndex] > 0) return;
    evacuationStartedAtMsRef.current[agentIndex] = nowMs;
  }

  function markEvacuationComplete(agentIndex: number, nowMs: number): void {
    if (evacuationCompletedAtMsRef.current[agentIndex] > 0) return;
    if (evacuationStartedAtMsRef.current[agentIndex] <= 0) {
      evacuationStartedAtMsRef.current[agentIndex] = nowMs;
    }
    evacuationCompletedAtMsRef.current[agentIndex] = nowMs;
    evacuationDurationSRef.current[agentIndex] = Math.max(
      0,
      (nowMs - evacuationStartedAtMsRef.current[agentIndex]) / 1000
    );
  }

  function exitLoadCountsByRadius(radiusM = EXIT_LOAD_RADIUS_M): number[] {
    const counts = new Array(EXIT_POINTS.length).fill(0);
    for (let i = 0; i < AGENT_COUNT; i += 1) {
      const p: LngLat = [positionsRef.current[i * 2], positionsRef.current[i * 2 + 1]];
      const status = agentStatus(i, p);
      if (status !== "evacuating" && status !== "danger") continue;
      for (let e = 0; e < EXIT_POINTS.length; e += 1) {
        if (distM(p, EXIT_POINTS[e].coordinate as LngLat) <= radiusM) {
          counts[e] += 1;
        }
      }
    }
    return counts;
  }

  function nearestExitIndex(point: LngLat): number {
    let nearest = 0;
    let best = Infinity;
    for (let e = 0; e < EXIT_POINTS.length; e += 1) {
      const exit = EXIT_POINTS[e];
      const d = distM(point, exit.coordinate);
      if (d < best) {
        best = d;
        nearest = e;
      }
    }
    return nearest;
  }

  function nearestAvailableExitIndex(point: LngLat): number {
    let nearest = -1;
    let best = Infinity;
    for (let e = 0; e < exitsRef.current.length; e += 1) {
      const exit = exitsRef.current[e];
      if (exit.status === "blocked") continue;
      const d = distM(point, [exit.lng, exit.lat]);
      if (d < best) {
        best = d;
        nearest = e;
      }
    }
    return nearest >= 0 ? nearest : nearestExitIndex(point);
  }

  function isHighCongestionBand(exit: SimExit): boolean {
    const flowPpm = Math.max(0, exit.flow_ppm ?? 0);
    const congestionPct = (flowPpm / EXIT_FLOW_CAP_PPM) * 100;
    return congestionPct >= EXIT_HIGH_CONGESTION_BAND_PCT;
  }

  function nearestAllowedRerouteExitIndex(point: LngLat, excludedExitIdx: number): number {
    let nearest = -1;
    let best = Infinity;
    for (let e = 0; e < exitsRef.current.length; e += 1) {
      if (e === excludedExitIdx) continue;
      const exit = exitsRef.current[e];
      if (exit.status === "blocked" || isHighCongestionBand(exit)) continue;
      const d = distM(point, [exit.lng, exit.lat]);
      if (d < best) {
        best = d;
        nearest = e;
      }
    }
    return nearest;
  }

  function rerouteFarthestAgentsFromCongestedExit(congestedExitIdx: number, rerouteRatio: number): number {
    if (rerouteRatio <= 0) return 0;
    const congestedExit = exitsRef.current[congestedExitIdx];
    if (!congestedExit) return 0;
    const congestedPoint: LngLat = [congestedExit.lng, congestedExit.lat];

    const candidates: { agentIdx: number; distanceM: number }[] = [];
    for (let i = 0; i < AGENT_COUNT; i += 1) {
      if (evacuationStateRef.current[i] !== EVAC_STATE_EXITING) continue;
      if (exitTargetIndexRef.current[i] !== congestedExitIdx) continue;
      const current: LngLat = [positionsRef.current[i * 2], positionsRef.current[i * 2 + 1]];
      candidates.push({ agentIdx: i, distanceM: distM(current, congestedPoint) });
    }
    if (candidates.length === 0) return 0;

    candidates.sort((a, b) => b.distanceM - a.distanceM);
    let rerouted = 0;
    const targetReroutes = Math.ceil(candidates.length * rerouteRatio);
    const limit = Math.min(targetReroutes, candidates.length);
    for (let i = 0; i < limit; i += 1) {
      const agentIdx = candidates[i].agentIdx;
      const current: LngLat = [positionsRef.current[agentIdx * 2], positionsRef.current[agentIdx * 2 + 1]];
      const newExitIdx = nearestAllowedRerouteExitIndex(current, congestedExitIdx);
      if (newExitIdx < 0) continue;
      exitTargetIndexRef.current[agentIdx] = newExitIdx;
      pathsRef.current[agentIdx] = [EXIT_POINTS[newExitIdx].coordinate as LngLat];
      rerouted += 1;
    }
    return rerouted;
  }

  function rerouteForExitStatusChanges(): void {
    let rerouted = 0;
    for (let i = 0; i < AGENT_COUNT; i += 1) {
      if (evacuationStateRef.current[i] !== EVAC_STATE_EXITING) continue;
      const curTarget = exitTargetIndexRef.current[i];
      if (curTarget < 0) continue;
      if (exitsRef.current[curTarget]?.status !== "blocked") continue;
      const currentPoint: LngLat = [positionsRef.current[i * 2], positionsRef.current[i * 2 + 1]];
      const newExitIdx = nearestAvailableExitIndex(currentPoint);
      if (newExitIdx === curTarget) continue;
      exitTargetIndexRef.current[i] = newExitIdx;
      pathsRef.current[i] = [[exitsRef.current[newExitIdx].lng, exitsRef.current[newExitIdx].lat]];
      rerouted += 1;
    }
    if (rerouted > 0) {
      appendAlert({
        id: `al-reroute-${Date.now()}`,
        ts: Date.now(),
        reason: "rerouted",
        old_exit: null,
        new_exit: null,
        affected: rerouted
      });
    }
  }

  function exitFlowPerMinute(nowMs: number): number[] {
    const threshold = nowMs - EXIT_FLOW_WINDOW_MS;
    const flows = new Array(EXIT_POINTS.length).fill(0);
    for (let i = 0; i < exitFlowEventsRef.current.length; i += 1) {
      const events = exitFlowEventsRef.current[i];
      while (events.length > 0 && events[0] < threshold) {
        events.shift();
      }
      flows[i] = Math.min(EXIT_FLOW_CAP_PPM, events.length);
    }
    return flows;
  }

  function recordExitFlowEvent(exitIdx: number, nowMs: number): void {
    if (exitIdx < 0 || exitIdx >= exitFlowEventsRef.current.length) return;
    const events = exitFlowEventsRef.current[exitIdx];
    const threshold = nowMs - EXIT_FLOW_WINDOW_MS;
    while (events.length > 0 && events[0] < threshold) {
      events.shift();
    }
    if (events.length >= EXIT_FLOW_CAP_PPM) {
      // Keep the latest capped window of flow events.
      events.shift();
    }
    events.push(nowMs);
  }

  function getOrCreateHazardDynamics(hazard: Hazard, nowMs: number): HazardDynamics {
    const existing = hazardDynamicsRef.current.get(hazard.id);
    if (existing) return existing;

    const created: HazardDynamics = {
      effectiveRadiusM: Math.min(HAZARD_MAX_RADIUS_M, hazard.radiusM * HAZARD_INITIAL_RADIUS_MULTIPLIER),
      nextExpandAtMs: nowMs + HAZARD_SPREAD_INTERVAL_MS
    };
    hazardDynamicsRef.current.set(hazard.id, created);
    return created;
  }

  function pruneHazardDynamics(): void {
    const active = new Set(hazardsRef.current.map((hazard) => hazard.id));
    for (const hazardId of hazardDynamicsRef.current.keys()) {
      if (!active.has(hazardId)) {
        hazardDynamicsRef.current.delete(hazardId);
      }
    }
  }

  function effectiveHazardRadius(hazard: Hazard): number {
    return hazardDynamicsRef.current.get(hazard.id)?.effectiveRadiusM ?? hazard.radiusM * HAZARD_INITIAL_RADIUS_MULTIPLIER;
  }

  function nearestContainingHazard(point: LngLat): { hazard: Hazard; distToCenterM: number } | null {
    let best: { hazard: Hazard; distToCenterM: number; distToBoundaryM: number } | null = null;
    for (const hazard of hazardsRef.current) {
      const distToCenterM = distM(point, [hazard.lng, hazard.lat]);
      if (distToCenterM > hazard.radiusM) continue;
      const distToBoundaryM = hazard.radiusM - distToCenterM;
      if (!best || distToBoundaryM < best.distToBoundaryM) {
        best = { hazard, distToCenterM, distToBoundaryM };
      }
    }
    return best ? { hazard: best.hazard, distToCenterM: best.distToCenterM } : null;
  }

  function shortestEscapeTarget(point: LngLat): LngLat | null {
    const containing = nearestContainingHazard(point);
    if (!containing) return null;

    const center: LngLat = [containing.hazard.lng, containing.hazard.lat];
    const avgLat = ((point[1] + center[1]) * 0.5 * Math.PI) / 180;
    let eastM = (point[0] - center[0]) * 111320 * Math.cos(avgLat);
    let northM = (point[1] - center[1]) * 110540;
    let mag = Math.hypot(eastM, northM);

    if (mag < 1e-6) {
      // Edge case: agent is at/near hazard center; nudge in a stable direction.
      eastM = 1;
      northM = 0;
      mag = 1;
    }

    const unitEast = eastM / mag;
    const unitNorth = northM / mag;
    const escapeDistanceM = Math.max(HAZARD_ESCAPE_BUFFER_M, containing.hazard.radiusM - containing.distToCenterM + HAZARD_ESCAPE_BUFFER_M);
    return clamp(offsetByMeters(point, unitEast * escapeDistanceM, unitNorth * escapeDistanceM));
  }

  function assignNearestExitRoute(agentIndex: number, current: LngLat): void {
    const exitIdx = nearestAvailableExitIndex(current);
    exitTargetIndexRef.current[agentIndex] = exitIdx;
    flowCountedExitRef.current[agentIndex] = -1;
    evacuationStateRef.current[agentIndex] = EVAC_STATE_EXITING;
    markEvacuationStart(agentIndex);
    speedsRef.current[agentIndex] = rand(SPAWN_TO_EXIT_SPEED_MIN, SPAWN_TO_EXIT_SPEED_MAX);
    pathsRef.current[agentIndex] = [EXIT_POINTS[exitIdx].coordinate as LngLat];
  }

  function assignEscapeRoute(agentIndex: number, current: LngLat): boolean {
    const target = shortestEscapeTarget(current);
    if (!target) return false;
    flowCountedExitRef.current[agentIndex] = -1;
    evacuationStateRef.current[agentIndex] = EVAC_STATE_ESCAPING;
    markEvacuationStart(agentIndex);
    speedsRef.current[agentIndex] = rand(SPAWN_TO_EXIT_SPEED_MIN, SPAWN_TO_EXIT_SPEED_MAX);
    pathsRef.current[agentIndex] = [target];
    return true;
  }

  function assignShortestHazardOrExitRoute(agentIndex: number, current: LngLat): boolean {
    const exitIdx = nearestAvailableExitIndex(current);
    const exitTarget = EXIT_POINTS[exitIdx].coordinate as LngLat;
    const exitDistanceM = distM(current, exitTarget);
    const escapeTarget = shortestEscapeTarget(current);
    const escapeDistanceM = escapeTarget ? distM(current, escapeTarget) : Infinity;

    if (exitDistanceM <= escapeDistanceM) {
      exitTargetIndexRef.current[agentIndex] = exitIdx;
      flowCountedExitRef.current[agentIndex] = -1;
      evacuationStateRef.current[agentIndex] = EVAC_STATE_EXITING;
      markEvacuationStart(agentIndex);
      speedsRef.current[agentIndex] = rand(SPAWN_TO_EXIT_SPEED_MIN, SPAWN_TO_EXIT_SPEED_MAX);
      pathsRef.current[agentIndex] = [exitTarget];
      return true;
    }

    return assignEscapeRoute(agentIndex, current);
  }

  function startEvacuationNow(agentIndex: number): boolean {
    const state = evacuationStateRef.current[agentIndex];
    if (state === EVAC_STATE_EXITING || state === EVAC_STATE_SAFE || state === EVAC_STATE_ESCAPING) return false;

    const current: LngLat = [positionsRef.current[agentIndex * 2], positionsRef.current[agentIndex * 2 + 1]];
    if (inDangerZone(current)) {
      return assignShortestHazardOrExitRoute(agentIndex, current);
    }
    assignNearestExitRoute(agentIndex, current);
    return true;
  }

  function evacuateAgentsWithinHazardRadius(hazard: Hazard, radiusM: number): number {
    const hazardPoint: LngLat = [hazard.lng, hazard.lat];
    let evacuated = 0;

    for (let i = 0; i < AGENT_COUNT; i += 1) {
      const current: LngLat = [positionsRef.current[i * 2], positionsRef.current[i * 2 + 1]];
      if (distM(current, hazardPoint) > radiusM) continue;
      if (startEvacuationNow(i)) evacuated += 1;
    }

    return evacuated;
  }

  function processHazardSpread(nowMs: number): { wavesAdvanced: number; evacuated: number } {
    pruneHazardDynamics();
    if (hazardsRef.current.length === 0) return { wavesAdvanced: 0, evacuated: 0 };

    let wavesAdvanced = 0;
    let evacuated = 0;

    for (const hazard of hazardsRef.current) {
      const dynamics = getOrCreateHazardDynamics(hazard, nowMs);

      if (dynamics.effectiveRadiusM < HAZARD_MAX_RADIUS_M && nowMs >= dynamics.nextExpandAtMs) {
        const steps = Math.floor((nowMs - dynamics.nextExpandAtMs) / HAZARD_SPREAD_INTERVAL_MS) + 1;
        dynamics.effectiveRadiusM = Math.min(HAZARD_MAX_RADIUS_M, dynamics.effectiveRadiusM + steps * HAZARD_SPREAD_INCREMENT_M);
        dynamics.nextExpandAtMs += steps * HAZARD_SPREAD_INTERVAL_MS;
        wavesAdvanced += steps;
      }

      evacuated += evacuateAgentsWithinHazardRadius(hazard, dynamics.effectiveRadiusM);
    }

    return { wavesAdvanced, evacuated };
  }

  function inDangerZone(point: LngLat): boolean {
    for (const hazard of hazardsRef.current) {
      const d = distM(point, [hazard.lng, hazard.lat]);
      if (d <= hazard.radiusM) return true;
    }
    return false;
  }

  function agentStatus(i: number, position: LngLat): SimAgent["status"] {
    const state = evacuationStateRef.current[i];
    if (state === EVAC_STATE_SAFE) return "safe";
    if (inDangerZone(position)) return "danger";
    if (state === EVAC_STATE_EXITING || state === EVAC_STATE_ESCAPING) return "evacuating";
    return "normal";
  }

  function agentColor(status: SimAgent["status"]): [number, number, number, number] {
    if (status === "danger") return [239, 68, 68, 245];
    if (status === "evacuating") return [251, 191, 36, 235];
    if (status === "safe") return [52, 211, 153, 225];
    return [0, 0, 0, 220];
  }

  function currentEtaSeconds(i: number): number | null {
    if (evacuationStateRef.current[i] !== EVAC_STATE_EXITING && evacuationStateRef.current[i] !== EVAC_STATE_ESCAPING) return null;
    if (pathsRef.current[i].length === 0) return null;
    let remaining = 0;
    let prev: LngLat = [positionsRef.current[i * 2], positionsRef.current[i * 2 + 1]];
    for (const p of pathsRef.current[i]) {
      remaining += distM(prev, p);
      prev = p;
    }
    const speed = Math.max(0.2, speedsRef.current[i]);
    return Math.round(remaining / speed);
  }

  function syncStoreSnapshot(): void {
    const agentPayload: SimAgent[] = [];
    const nowMs = Date.now();
    const loadByExit = exitLoadCountsByRadius(EXIT_LOAD_RADIUS_M);
    const flowByExit = exitFlowPerMinute(nowMs);
    const previousStatuses = exitsRef.current.map((exit) => exit.status);
    const loadRatioByExit = loadByExit.map((queue) => queue / EXIT_LOAD_BASELINE);

    for (let i = 0; i < AGENT_COUNT; i += 1) {
      const position: LngLat = [positionsRef.current[i * 2], positionsRef.current[i * 2 + 1]];
      const state = evacuationStateRef.current[i];
      const status = agentStatus(i, position);
      const eta = currentEtaSeconds(i);
      const exitIdx = exitTargetIndexRef.current[i];
      const exitTarget = state === EVAC_STATE_EXITING && exitIdx >= 0 ? exitsRef.current[exitIdx]?.id ?? null : null;
      const evacStartedAt = evacuationStartedAtMsRef.current[i];
      const evacCompletedAt = evacuationCompletedAtMsRef.current[i];
      const evacDurationS = evacuationDurationSRef.current[i];

      agentPayload.push({
        id: idsRef.current[i],
        lat: position[1],
        lng: position[0],
        status,
        sector: 1,
        exit_target: exitTarget,
        path_eta_s: eta,
        evac_started_at_ms: evacStartedAt > 0 ? Math.round(evacStartedAt) : null,
        evac_completed_at_ms: evacCompletedAt > 0 ? Math.round(evacCompletedAt) : null,
        evac_duration_s: evacCompletedAt > 0 ? Math.round(evacDurationS) : null
      });
    }

    exitsRef.current = exitsRef.current.map((exit, idx) => {
      const queue = loadByExit[idx] ?? 0;
      const flowPpm = flowByExit[idx] ?? 0;
      if (exit.override || exit.status === "blocked") {
        return {
          ...exit,
          queue,
          flow_ppm: flowPpm
        };
      }
      const loadRatio = loadRatioByExit[idx] ?? 0;
      return {
        ...exit,
        queue,
        flow_ppm: flowPpm,
        status: loadRatio >= EXIT_CONGESTED_THRESHOLD ? "congested" : "open"
      };
    });

    let congestedRerouted = 0;
    for (let exitIdx = 0; exitIdx < exitsRef.current.length; exitIdx += 1) {
      const prev = previousStatuses[exitIdx];
      const next = exitsRef.current[exitIdx].status;
      const stillPastThreshold = (loadRatioByExit[exitIdx] ?? 0) >= EXIT_CONGESTED_THRESHOLD;
      if (prev !== "congested" && next === "congested") {
        congestedRerouted += rerouteFarthestAgentsFromCongestedExit(exitIdx, CONGESTED_INITIAL_REROUTE_RATIO);
        congestedRerouteAtMsRef.current[exitIdx] = nowMs;
      } else if (next === "congested" && stillPastThreshold) {
        const lastRerouteAt = congestedRerouteAtMsRef.current[exitIdx] ?? 0;
        if (nowMs - lastRerouteAt >= CONGESTED_RECHECK_MS) {
          congestedRerouted += rerouteFarthestAgentsFromCongestedExit(exitIdx, CONGESTED_RECHECK_REROUTE_RATIO);
          congestedRerouteAtMsRef.current[exitIdx] = nowMs;
        }
      } else {
        congestedRerouteAtMsRef.current[exitIdx] = 0;
      }
    }
    if (congestedRerouted > 0) {
      appendAlert({
        id: `al-congested-reroute-${Date.now()}`,
        ts: Date.now(),
        reason: "congested_reroute",
        old_exit: null,
        new_exit: null,
        affected: congestedRerouted
      });
    }

    const hazardsPayload: SimHazard[] = hazardsRef.current.map((h) => ({
      id: h.id,
      lat: h.lat,
      lng: h.lng,
      radius_m: h.radiusM,
      type: h.type
    }));

    frameRef.current += 1;
    ingestAgentMetrics(agentPayload);
    useSimStore.setState({ frame: frameRef.current });
    setAgentsStore(agentPayload);
    setExitsStore(exitsRef.current);
    setHazardsStore(hazardsPayload);
  }

  variantRef.current = variant;
  selectedIndexRef.current = selectedIndex;
  layersRef.current = layerSettings;
  placeHazardModeRef.current = placeHazardMode;
  hazardRadiusRef.current = hazardRadius;
  hazardsRef.current = hazards;

  const heatmapData = useMemo(() => {
    const data: { position: LngLat; weight: number }[] = [];
    for (let i = 0; i < AGENT_COUNT; i += 1) {
      data.push({ position: [positionsRef.current[i * 2], positionsRef.current[i * 2 + 1]], weight: 1 });
    }
    return data;
  }, [heatmapRev]);
  const heatmapGeoJson = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(
    () => ({
      type: "FeatureCollection",
      features: heatmapData.map((pt) => ({
        type: "Feature",
        properties: { weight: pt.weight },
        geometry: {
          type: "Point",
          coordinates: pt.position
        }
      }))
    }),
    [heatmapData]
  );

  const hazardGeoJson = useMemo<GeoJSON.FeatureCollection<GeoJSON.Polygon>>(
    () => ({
      type: "FeatureCollection",
      features: hazards.map((hazard) => ({
        type: "Feature",
        properties: { id: hazard.id, type: hazard.type, radius_m: hazard.radiusM },
        geometry: {
          type: "Polygon",
          coordinates: [hazardPolygon(hazard.lat, hazard.lng, hazard.radiusM)]
        }
      }))
    }),
    [hazards]
  );
  const evacuationZonesGeoJson = useMemo<GeoJSON.FeatureCollection<GeoJSON.Polygon>>(
    () => ({
      type: "FeatureCollection",
      features: EXIT_POINTS.map((exit, idx) => {
        const zoneIdx = EXIT_TO_DISPERSAL_INDEX[exit.id] ?? idx;
        const polygon = DISPERSAL_POLYGONS[zoneIdx] ?? DISPERSAL_POLYGONS[0];
        return {
          type: "Feature",
          properties: {
            id: `zone-${exit.id}`,
            exit_id: exit.id,
            exit_label: exit.label
          },
          geometry: {
            type: "Polygon",
            coordinates: [polygon]
          }
        };
      })
    }),
    []
  );

  function normalPath(): LngLat[] {
    const n = 2 + Math.floor(Math.random() * 3);
    return Array.from({ length: n }, () => samplePointInPolygon(SPAWN_POLYGON));
  }

  function dispersalPolygonByExitIndex(exitIdx?: number): LngLat[] {
    if (typeof exitIdx === "number" && exitIdx >= 0 && exitIdx < EXIT_POINTS.length) {
      const exitId = EXIT_POINTS[exitIdx]?.id;
      const zoneIdx = exitId ? EXIT_TO_DISPERSAL_INDEX[exitId] : undefined;
      if (typeof zoneIdx === "number" && DISPERSAL_POLYGONS[zoneIdx]) {
        return DISPERSAL_POLYGONS[zoneIdx];
      }
    }
    return DISPERSAL_POLYGONS[Math.floor(Math.random() * DISPERSAL_POLYGONS.length)];
  }

  function dispersalPath(exitIdx?: number, startAt?: LngLat): LngLat[] {
    const polygon = dispersalPolygonByExitIndex(exitIdx);
    const ring = stripClosedRing(polygon);
    const n = 4 + Math.floor(Math.random() * 4);
    const points: LngLat[] = [];
    let cursor: LngLat = startAt ?? samplePointInPolygon(polygon);

    for (let i = 0; i < n; i += 1) {
      const angle = rand(0, Math.PI * 2);
      const stepM = rand(8, 22);
      const candidate = offsetByMeters(cursor, Math.cos(angle) * stepM, Math.sin(angle) * stepM);
      const next = pointInPolygon(candidate, ring) ? candidate : samplePointInPolygon(polygon);
      points.push(next);
      cursor = next;
    }
    return points;
  }

  function snapshot(i: number): Agent {
    return {
      id: idsRef.current[i],
      position: [positionsRef.current[i * 2], positionsRef.current[i * 2 + 1]],
      sector: sectorsRef.current[i],
      speed: Number(speedsRef.current[i].toFixed(2)),
      path: [...pathsRef.current[i]]
    };
  }

  function initAgents(): void {
    for (let i = 0; i < AGENT_COUNT; i += 1) {
      const p = samplePointInPolygon(SPAWN_POLYGON);
      positionsRef.current[i * 2] = p[0];
      positionsRef.current[i * 2 + 1] = p[1];
      sectorsRef.current[i] = "Spawn Area";
      speedsRef.current[i] = rand(NORMAL_ROAM_SPEED_MIN, NORMAL_ROAM_SPEED_MAX);
      pathsRef.current[i] = normalPath();
      evacuationStateRef.current[i] = EVAC_STATE_NORMAL;
      wasInHazardRef.current[i] = 0;
      flowCountedExitRef.current[i] = -1;
      exitTargetIndexRef.current[i] = -1;
    }
    exitFlowEventsRef.current = Array.from({ length: EXIT_POINTS.length }, () => []);
    congestedRerouteAtMsRef.current = Array.from({ length: EXIT_POINTS.length }, () => 0);
    hazardDynamicsRef.current.clear();
    posVerRef.current += 1;
  }

  function resetSpawnAgentsToNormalRoaming(): number {
    let resetCount = 0;
    for (let i = 0; i < AGENT_COUNT; i += 1) {
      const current: LngLat = [positionsRef.current[i * 2], positionsRef.current[i * 2 + 1]];
      if (!pointInPolygon(current, SPAWN_POLYGON)) continue;
      evacuationStateRef.current[i] = EVAC_STATE_NORMAL;
      wasInHazardRef.current[i] = 0;
      flowCountedExitRef.current[i] = -1;
      exitTargetIndexRef.current[i] = -1;
      speedsRef.current[i] = rand(NORMAL_ROAM_SPEED_MIN, NORMAL_ROAM_SPEED_MAX);
      pathsRef.current[i] = normalPath();
      resetCount += 1;
    }
    if (resetCount > 0) posVerRef.current += 1;
    return resetCount;
  }

  function clearMapMarkers() {
    for (const m of mapMarkersRef.current) m.remove();
    mapMarkersRef.current = [];
  }

  function refreshDeck() {
    const overlay = deckRef.current;
    if (!overlay) return;
    const layers: unknown[] = [];
    if (layersRef.current.showAgents) {
      layers.push(
        new ScatterplotLayer<number>({
          id: "agents",
          data: Array.from({ length: AGENT_COUNT }, (_, i) => i),
          pickable: true,
          radiusMinPixels: 2,
          radiusMaxPixels: 4,
          getRadius: () => 3,
          getPosition: (i) => [positionsRef.current[i * 2], positionsRef.current[i * 2 + 1]],
          getFillColor: (i) => {
            if (!layersRef.current.showSafetyStatus) return [0, 0, 0, 220];
            const p: LngLat = [positionsRef.current[i * 2], positionsRef.current[i * 2 + 1]];
            return agentColor(agentStatus(i, p));
          },
          onClick: (info: PickingInfo<number>) => {
            if (typeof info.index === "number" && info.index >= 0) {
              setSelectedIndex(info.index);
              setSelectedAgent(snapshot(info.index));
            }
          },
          updateTriggers: { getPosition: [posVerRef.current] }
        })
      );
    }
    if (selectedIndexRef.current !== null && pathsRef.current[selectedIndexRef.current].length > 0) {
      const i = selectedIndexRef.current;
      const rawPath = [[positionsRef.current[i * 2], positionsRef.current[i * 2 + 1]] as LngLat, ...pathsRef.current[i]];
      const segments = rawPath.slice(0, -1).map((point, idx) => ({ source: point, target: rawPath[idx + 1] }));
      layers.push(
        new LineLayer<{ source: LngLat; target: LngLat }>({
          id: "path",
          data: segments,
          getSourcePosition: (d) => d.source,
          getTargetPosition: (d) => d.target,
          getColor: () => [34, 211, 238, 200],
          getWidth: () => 2,
          widthUnits: "pixels"
        })
      );
    }
    overlay.setProps({ layers: layers as never[] });
  }

  function refreshMapLayerVisibility() {
    const map = mapRef.current;
    if (!map) return;
    if (!map.isStyleLoaded()) {
      return;
    }

    const hm = layersRef.current.showHeatmap ? "visible" : "none";
    const evacZones = layersRef.current.showEvacuationZones ? "visible" : "none";
    const haz = "visible";

    if (
      !map.getLayer("agent-heatmap") ||
      !map.getLayer("evac-zones-fill") ||
      !map.getLayer("evac-zones-outline") ||
      !map.getLayer("hazards-fill") ||
      !map.getLayer("hazards-outline")
    ) {
      addOutdoorLayers(map);
    }

    if (map.getLayer("agent-heatmap")) {
      map.setLayoutProperty("agent-heatmap", "visibility", hm);
    }
    if (map.getLayer("evac-zones-fill")) {
      map.setLayoutProperty("evac-zones-fill", "visibility", evacZones);
    }
    if (map.getLayer("evac-zones-outline")) {
      map.setLayoutProperty("evac-zones-outline", "visibility", evacZones);
    }
    if (map.getLayer("hazards-fill")) {
      map.setLayoutProperty("hazards-fill", "visibility", haz);
    }
    if (map.getLayer("hazards-outline")) {
      map.setLayoutProperty("hazards-outline", "visibility", haz);
    }

    raiseCoverageLayers();
  }

  function raiseCoverageLayers() {
    const map = mapRef.current;
    if (!map) return;

    const orderedLayerIds = ["agent-heatmap", "evac-zones-fill", "evac-zones-outline", "hazards-fill", "hazards-outline"];

    const moveLayer = (layerId: string) => {
      if (!map.getLayer(layerId)) {
        return;
      }

      try {
        map.moveLayer(layerId);
      } catch {
        window.requestAnimationFrame(() => {
          if (map.getLayer(layerId)) {
            try {
              map.moveLayer(layerId);
            } catch {
              // no-op
            }
          }
        });
      }
    };

    for (const layerId of orderedLayerIds) {
      moveLayer(layerId);
    }

    window.requestAnimationFrame(() => {
      for (const layerId of orderedLayerIds) {
        moveLayer(layerId);
      }
    });
  }

  function addOutdoorLayers(map: mapboxgl.Map) {
    if (!map.isStyleLoaded()) return;
    clearMapMarkers();

    const heatmapSource = map.getSource("agent-heatmap-src") as mapboxgl.GeoJSONSource | null;
    if (!heatmapSource) {
      map.addSource("agent-heatmap-src", { type: "geojson", data: heatmapGeoJson as never });
    } else {
      heatmapSource.setData(heatmapGeoJson as never);
    }

    const hazardSource = map.getSource("hazards-src") as mapboxgl.GeoJSONSource | null;
    if (!hazardSource) {
      map.addSource("hazards-src", { type: "geojson", data: hazardGeoJson as never });
    } else {
      hazardSource.setData(hazardGeoJson as never);
    }
    const evacuationZoneSource = map.getSource("evac-zones-src") as mapboxgl.GeoJSONSource | null;
    if (!evacuationZoneSource) {
      map.addSource("evac-zones-src", { type: "geojson", data: evacuationZonesGeoJson as never });
    } else {
      evacuationZoneSource.setData(evacuationZonesGeoJson as never);
    }

    if (!map.getLayer("agent-heatmap")) {
      try {
        map.addLayer(
          {
            id: "agent-heatmap",
            type: "heatmap",
            source: "agent-heatmap-src",
            maxzoom: 17,
            paint: {
              "heatmap-weight": ["interpolate", ["linear"], ["get", "weight"], 0, 0, 1, 1],
              "heatmap-intensity": 1.15,
              "heatmap-color": [
                "interpolate",
                ["linear"],
                ["heatmap-density"],
                0,
                "rgba(59,130,246,0)",
                0.2,
                "rgba(59,130,246,120)",
                0.5,
                "rgba(245,158,11,150)",
                1,
                "rgba(239,68,68,210)"
              ],
              "heatmap-radius": 20,
              "heatmap-opacity": 0.7
            },
            layout: { visibility: layersRef.current.showHeatmap ? "visible" : "none" }
          }
        );
      } catch {
        // no-op
      }
    }

    if (!map.getLayer("hazards-fill")) {
      try {
        map.addLayer({
          id: "hazards-fill",
          type: "fill",
          source: "hazards-src",
          paint: {
            "fill-color": "#dc2626",
            "fill-opacity": 0.14
          },
          layout: { visibility: "visible" }
        });
      } catch {
        // no-op
      }
    }

    if (!map.getLayer("evac-zones-fill")) {
      try {
        map.addLayer({
          id: "evac-zones-fill",
          type: "fill",
          source: "evac-zones-src",
          paint: {
            "fill-color": "#facc15",
            "fill-opacity": 0.14
          },
          layout: { visibility: layersRef.current.showEvacuationZones ? "visible" : "none" }
        });
      } catch {
        // no-op
      }
    }

    if (!map.getLayer("evac-zones-outline")) {
      try {
        map.addLayer({
          id: "evac-zones-outline",
          type: "line",
          source: "evac-zones-src",
          paint: {
            "line-color": "#eab308",
            "line-width": 3,
            "line-opacity": 0.95
          },
          layout: { visibility: layersRef.current.showEvacuationZones ? "visible" : "none" }
        });
      } catch {
        // no-op
      }
    }

    if (!map.getLayer("hazards-outline")) {
      try {
        map.addLayer({
          id: "hazards-outline",
          type: "line",
          source: "hazards-src",
          paint: {
            "line-color": "#ef4444",
            "line-width": 3,
            "line-opacity": 0.95
          },
          layout: { visibility: "visible" }
        });
      } catch {
        // no-op
      }
    }

    for (const exit of EXIT_POINTS) {
      mapMarkersRef.current.push(new mapboxgl.Marker({ element: exitMarkerEl(exit.label) }).setLngLat(exit.coordinate).addTo(map));
    }
    refreshMapLayerVisibility();
  }

  function exitMarkerEl(name: string): HTMLDivElement {
    const wrap = document.createElement("div");
    wrap.className = "pointer-events-none flex items-center gap-1";

    const dot = document.createElement("div");
    dot.className = "h-3 w-3 rounded-full bg-sky-500 shadow-[0_0_0_4px_rgba(14,165,233,0.28)]";
    dot.title = name;

    const label = document.createElement("div");
    label.className =
      "rounded border border-slate-300 bg-white/95 px-1.5 py-0.5 text-[10px] font-semibold text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100";
    label.textContent = name;

    wrap.appendChild(dot);
    wrap.appendChild(label);
    return wrap;
  }

  useEffect(() => {
    initAgents();
    refreshDeck();
    syncStoreSnapshot();
  }, []);

  useEffect(() => {
    if (storeExits.length === 0) return;
    const byId = new Map(storeExits.map((exit) => [exit.id, exit]));
    let changed = false;
    exitsRef.current = exitsRef.current.map((exit) => {
      const next = byId.get(exit.id);
      if (!next) return exit;
      if (next.status !== exit.status || Boolean(next.override) !== Boolean(exit.override)) changed = true;
      return {
        ...exit,
        status: next.status,
        override: next.override
      };
    });
    if (changed) rerouteForExitStatusChanges();
  }, [storeExits]);

  useEffect(() => {
    localStorage.setItem("campuswatch-dark-mode", darkMode ? "dark" : "light");
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  useEffect(() => localStorage.setItem("campuswatch-sidebar-collapsed", String(sidebarCollapsed)), [sidebarCollapsed]);

  useEffect(() => {
    mapboxgl.accessToken = getMapboxToken();
    const map = new mapboxgl.Map({
      container: mapContainerRef.current as HTMLElement,
      style: outdoorStyle(variantRef.current),
      center: VENUE_CENTER,
      zoom: CAMERA_DEFAULT_ZOOM,
      pitch: CAMERA_DEFAULT_PITCH,
      bearing: CAMERA_DEFAULT_BEARING,
      minZoom: CAMERA_MIN_ZOOM,
      maxZoom: CAMERA_MAX_ZOOM
    });
    mapRef.current = map;
    const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
    deckRef.current = overlay;
    map.addControl(overlay);
    // Ensure deck.gl canvas stays above the basemap canvas.
    window.setTimeout(() => {
      const deckCanvas = map.getContainer().querySelector(".deckgl-overlay") as HTMLElement | null;
      if (deckCanvas) {
        deckCanvas.style.zIndex = "2";
        deckCanvas.style.pointerEvents = "none";
      }
    }, 0);
    map.on("style.load", () => {
      addOutdoorLayers(map);
      refreshMapLayerVisibility();
      raiseCoverageLayers();
      refreshDeck();
    });
    map.on("load", () => {
      addOutdoorLayers(map);
      refreshMapLayerVisibility();
      raiseCoverageLayers();
      refreshDeck();
    });
    map.on("click", (e: MapLayerMouseEvent) => {
      if (placeHazardModeRef.current) {
        const nowMs = Date.now();
        const newHazard: Hazard = {
          id: `h-${nowMs}-${Math.floor(Math.random() * 1000)}`,
          lat: e.lngLat.lat,
          lng: e.lngLat.lng,
          radiusM: hazardRadiusRef.current,
          type: "fire"
        };
        const dynamics = getOrCreateHazardDynamics(newHazard, nowMs);
        const evacuated = evacuateAgentsWithinHazardRadius(newHazard, dynamics.effectiveRadiusM);
        const nextHazards = [...hazardsRef.current, newHazard];
        hazardsRef.current = nextHazards;
        setHazards(nextHazards);
        setHazardMessage(
          `Hazard added (${newHazard.radiusM}m). Wave radius ${Math.round(dynamics.effectiveRadiusM)}m, evacuating ${evacuated}.`
        );
        appendAlert({
          id: `al-hazard-${nowMs}`,
          ts: nowMs,
          reason: "hazard_added",
          old_exit: null,
          new_exit: null,
          affected: evacuated
        });
        if (evacuated > 0) posVerRef.current += 1;
        syncStoreSnapshot();
        refreshDeck();
        return;
      }
    });
    return () => {
      clearMapMarkers();
      overlay.finalize();
      map.remove();
    };
  }, []);

  useEffect(() => {
    refreshMapLayerVisibility();
    refreshDeck();
  }, [layerSettings, selectedIndex]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = placeHazardMode ? "crosshair" : "";
  }, [placeHazardMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.isStyleLoaded()) return;
    const heatmapSource = map.getSource("agent-heatmap-src") as mapboxgl.GeoJSONSource | undefined;
    heatmapSource?.setData(heatmapGeoJson as never);
    const hazardSource = map.getSource("hazards-src") as mapboxgl.GeoJSONSource | undefined;
    hazardSource?.setData(hazardGeoJson as never);
    const evacuationZonesSource = map.getSource("evac-zones-src") as mapboxgl.GeoJSONSource | undefined;
    evacuationZonesSource?.setData(evacuationZonesGeoJson as never);
    if (
      !map.getLayer("agent-heatmap") ||
      !map.getLayer("evac-zones-fill") ||
      !map.getLayer("evac-zones-outline") ||
      !map.getLayer("hazards-fill") ||
      !map.getLayer("hazards-outline")
    ) {
      addOutdoorLayers(map);
    }
    raiseCoverageLayers();
    refreshMapLayerVisibility();
  }, [evacuationZonesGeoJson, hazardGeoJson, heatmapGeoJson]);

  useEffect(() => {
    syncStoreSnapshot();
  }, [hazards]);

  useEffect(() => {
    mapRef.current?.setStyle(outdoorStyle(variant));
  }, [variant]);

  useEffect(() => {
    const sim = window.setInterval(() => {
      let moved = false;
      const nowMs = Date.now();
      const spread = processHazardSpread(nowMs);

      if (hazardsRef.current.length > 0 && (spread.wavesAdvanced > 0 || spread.evacuated > 0)) {
        const maxWaveRadius = hazardsRef.current.reduce((max, hazard) => Math.max(max, effectiveHazardRadius(hazard)), 0);
        setHazardMessage(
          `Wave radius ${Math.round(maxWaveRadius)}m. Evacuating +${spread.evacuated}, waves +${spread.wavesAdvanced}.`
        );
      }

      for (let i = 0; i < AGENT_COUNT; i += 1) {
        const cur: LngLat = [positionsRef.current[i * 2], positionsRef.current[i * 2 + 1]];
        const inHazard = inDangerZone(cur);
        const wasInHazard = wasInHazardRef.current[i] === 1;

        if (inHazard) {
          wasInHazardRef.current[i] = 1;
          if (evacuationStateRef.current[i] !== EVAC_STATE_SAFE && (!wasInHazard || pathsRef.current[i].length === 0)) {
            assignShortestHazardOrExitRoute(i, cur);
          }
        } else if (wasInHazard) {
          wasInHazardRef.current[i] = 0;
          if (evacuationStateRef.current[i] !== EVAC_STATE_SAFE) {
            assignNearestExitRoute(i, cur);
          }
        }

        if (pathsRef.current[i].length === 0) {
          if (evacuationStateRef.current[i] === EVAC_STATE_EXITING) {
            assignNearestExitRoute(i, cur);
          } else if (evacuationStateRef.current[i] === EVAC_STATE_ESCAPING) {
            if (inHazard) {
              if (!assignShortestHazardOrExitRoute(i, cur)) {
                assignNearestExitRoute(i, cur);
              }
            } else {
              assignNearestExitRoute(i, cur);
            }
          } else if (evacuationStateRef.current[i] === EVAC_STATE_SAFE) {
            pathsRef.current[i] = dispersalPath(exitTargetIndexRef.current[i], cur);
          } else {
            pathsRef.current[i] = normalPath();
          }
        }
        if (pathsRef.current[i].length === 0) continue;

        if (evacuationStateRef.current[i] === EVAC_STATE_EXITING) {
          const exitIdx = exitTargetIndexRef.current[i];
          if (exitIdx >= 0 && exitIdx < EXIT_POINTS.length) {
            const exitPoint = EXIT_POINTS[exitIdx].coordinate as LngLat;
            const distToExitM = distM(cur, exitPoint);
            if (distToExitM <= EXIT_FLOW_CAPTURE_RADIUS_M && flowCountedExitRef.current[i] !== exitIdx) {
              recordExitFlowEvent(exitIdx, nowMs);
              flowCountedExitRef.current[i] = exitIdx;
            }
          }
        } else {
          flowCountedExitRef.current[i] = -1;
        }

        if (evacuationStateRef.current[i] === EVAC_STATE_EXITING) {
          const exitIdx = exitTargetIndexRef.current[i];
          if (exitIdx >= 0 && exitIdx < EXIT_POINTS.length) {
            const exitPoint = EXIT_POINTS[exitIdx].coordinate as LngLat;
            const distToExitM = distM(cur, exitPoint);
            if (distToExitM <= EXIT_APPROACH_RADIUS_M) {
              const flowPpm = Math.max(0, exitsRef.current[exitIdx]?.flow_ppm ?? 0);
              const [minSpeed, maxSpeed] = evacuationSpeedBandByFlowPpm(flowPpm);
              const currentSpeed = speedsRef.current[i];
              if (currentSpeed < minSpeed || currentSpeed > maxSpeed) {
                speedsRef.current[i] = rand(minSpeed, maxSpeed);
              }
            }
          }
        }

        const target = pathsRef.current[i][0];
        const d = distM(cur, target);
        const step = speedsRef.current[i] * (STEP_MS / 1000);
        const next = d <= step ? target : clamp([cur[0] + ((target[0] - cur[0]) * step) / d, cur[1] + ((target[1] - cur[1]) * step) / d]);
        positionsRef.current[i * 2] = next[0];
        positionsRef.current[i * 2 + 1] = next[1];
        moved = true;

        if (d <= step || distM(next, target) < 1.2) {
          pathsRef.current[i].shift();
          if (evacuationStateRef.current[i] === EVAC_STATE_EXITING && pathsRef.current[i].length === 0) {
            const zonePolygon = dispersalPolygonByExitIndex(exitTargetIndexRef.current[i]);
            const zoneStart = samplePointInPolygon(zonePolygon);
            positionsRef.current[i * 2] = zoneStart[0];
            positionsRef.current[i * 2 + 1] = zoneStart[1];
            markEvacuationComplete(i, nowMs);
            evacuationStateRef.current[i] = EVAC_STATE_SAFE;
            speedsRef.current[i] = rand(EXIT_TO_DISPERSAL_SPEED_MIN, EXIT_TO_DISPERSAL_SPEED_MAX);
            pathsRef.current[i] = dispersalPath(exitTargetIndexRef.current[i], zoneStart);
            moved = true;
          }
        }
      }
      if (spread.evacuated > 0) posVerRef.current += 1;
      if (moved) posVerRef.current += 1;
      refreshDeck();
    }, STEP_MS);

    const heat = window.setInterval(() => setHeatmapRev((x) => x + 1), HEATMAP_MS);
    const sync = window.setInterval(() => syncStoreSnapshot(), STORE_SYNC_MS);
    const uiTimer = window.setInterval(() => {
      const nextCounts: AgentStatusCounts = { normal: 0, evacuating: 0, safe: 0, danger: 0 };
      for (let i = 0; i < AGENT_COUNT; i += 1) {
        const p: LngLat = [positionsRef.current[i * 2], positionsRef.current[i * 2 + 1]];
        const status = agentStatus(i, p);
        nextCounts[status] += 1;
      }
      setStatusCounts(nextCounts);
      if (selectedIndexRef.current !== null) setSelectedAgent(snapshot(selectedIndexRef.current));
    }, UI_MS);
    return () => { window.clearInterval(sim); window.clearInterval(heat); window.clearInterval(sync); window.clearInterval(uiTimer); };
  }, []);

  const sideTop = "top-16";
  const panelTop = "top-16";

  return (
    <div className={darkMode ? "dark" : ""}>
      <section className="font-hero-space relative h-screen w-screen overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
        <div ref={mapContainerRef} className="absolute inset-0" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/25 via-transparent to-slate-950/45" />
        <GlassFilter />

        <Glass
          className="top-3 z-40"
          width="w-[calc(100vw-1.5rem)]"
          height="h-12"
        >
          <header className="flex h-full items-center justify-between text-slate-900 dark:text-slate-100">
            <div className="flex h-full min-w-0 items-center gap-3">
              <div className="flex h-8 items-center gap-2 rounded-lg bg-cyan-900/65 px-2.5 py-0 text-cyan-100 dark:bg-cyan-800/55 dark:text-cyan-100">
                <Shield className="h-4 w-4" />
                <span className="font-mono-display text-sm leading-none">CrowdSafe</span>
              </div>
              <div className="hidden items-center gap-2 text-xs text-slate-600 dark:text-slate-300 sm:flex md:gap-3 lg:text-sm">
                <span className="flex items-center gap-1"><Users className="h-4 w-4 text-cyan-500 dark:text-cyan-300" />Total <span className="font-mono-display text-slate-900 dark:text-slate-100">{AGENT_COUNT.toLocaleString()}</span></span>
                <span className="rounded border border-transparent bg-slate-800/70 px-2 py-0.5 text-[11px]"><span className="font-semibold text-slate-200">Normal</span> <span className="font-mono-display text-slate-100">{statusCounts.normal.toLocaleString()}</span></span>
                <span className="rounded border border-transparent bg-emerald-900/70 px-2 py-0.5 text-[11px]"><span className="font-semibold text-emerald-100">Safe</span> <span className="font-mono-display text-emerald-100">{statusCounts.safe.toLocaleString()}</span></span>
                <span className="rounded border border-transparent bg-amber-900/70 px-2 py-0.5 text-[11px]"><span className="font-semibold text-amber-100">Evacuating</span> <span className="font-mono-display text-amber-100">{statusCounts.evacuating.toLocaleString()}</span></span>
                <span className="rounded border border-transparent bg-rose-900/70 px-2 py-0.5 text-[11px]"><span className="font-semibold text-rose-100">Danger</span> <span className="font-mono-display text-rose-100">{statusCounts.danger.toLocaleString()}</span></span>
              </div>
            </div>
            <div className="flex h-full items-center gap-2">
              <GlassButton type="button" onClick={() => setSidebarCollapsed((x) => !x)} className="sm:hidden text-slate-900 dark:text-slate-100">
                {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </GlassButton>
              <GlassEffect borderless rimless className="hidden h-8 items-center rounded-xl p-0 sm:flex">
                <button type="button" onClick={() => setVariant("2d")} className={`inline-flex h-8 items-center gap-1 rounded-lg px-2.5 py-0 text-xs leading-none transition ${variant === "2d" ? "bg-cyan-500/60 text-slate-950 shadow-sm" : "text-slate-900 hover:bg-white/35 dark:text-slate-100 dark:hover:bg-slate-700/45"}`}><MapIcon className="h-4 w-4" /><span className="leading-none">2D</span></button>
                <button type="button" onClick={() => setVariant("3d")} className={`inline-flex h-8 items-center gap-1 rounded-lg px-2.5 py-0 text-xs leading-none transition ${variant === "3d" ? "bg-cyan-500/60 text-slate-950 shadow-sm" : "text-slate-900 hover:bg-white/35 dark:text-slate-100 dark:hover:bg-slate-700/45"}`}><MapIcon className="h-4 w-4" /><span className="leading-none">3D</span></button>
              </GlassEffect>
              <GlassButton type="button" onClick={() => setDarkMode((x) => !x)} borderless rimless className="h-8 text-slate-900 dark:text-slate-100" buttonClassName="h-8 px-3 py-0 leading-none">
                {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                <span className="hidden text-xs sm:inline">{darkMode ? "Light" : "Dark"}</span>
              </GlassButton>
              <GlassButton type="button" onClick={() => navigate("/dashboard")} borderless rimless className="h-8 text-slate-900 dark:text-slate-100" buttonClassName="h-8 px-3 py-0 text-xs font-medium leading-none">
                <Layers className="h-4 w-4" />
                <span className="leading-none">Dashboard</span>
              </GlassButton>
            </div>
          </header>
        </Glass>

        <aside className={`fixed ${sideTop} left-3 z-30 w-[min(18rem,calc(100vw-1.5rem))] transition-transform sm:w-72 sm:translate-x-0 ${sidebarCollapsed ? "-translate-x-[calc(100%+1rem)]" : "translate-x-0"}`}>
          <GlassCard className="gap-4 py-4 text-slate-900 dark:text-slate-100">
            <GlassCardHeader className="px-4">
              <GlassCardTitle className="text-sm uppercase tracking-wide text-slate-700 dark:text-slate-200">Map Controls</GlassCardTitle>
              <GlassCardDescription className="text-xs text-slate-600 dark:text-slate-300">
                Toggle layers and configure hazard simulation.
              </GlassCardDescription>
            </GlassCardHeader>
            <GlassCardContent className="space-y-4 px-4">
              <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Layers</p>
              <div className="mt-2 space-y-2">
                {[
                  ["showAgents", "Agent Dots"],
                  ["showHeatmap", "Density Heatmap"],
                  ["showSafetyStatus", "Safety Status"],
                  ["showEvacuationZones", "Evacuation Zones"]
                ].map(([key, label]) => (
                  <GlassButton key={key} type="button" onClick={() => toggleLayer(key as keyof LayerSettings)} className="flex w-full items-center justify-between text-left text-sm text-slate-900 dark:text-slate-100">
                    <span className="flex items-center gap-2">
                      <span className={`flex h-5 w-5 items-center justify-center rounded border ${(layerSettings[key as keyof LayerSettings] as boolean) ? "border-cyan-400 bg-cyan-500/20 text-cyan-300" : "border-slate-600 bg-slate-900 text-slate-500"}`}><Check className="h-3 w-3" /></span>
                      <span>{label}</span>
                    </span>
                    <span className="font-mono-display text-xs text-slate-400">{(layerSettings[key as keyof LayerSettings] as boolean) ? "ON" : "OFF"}</span>
                  </GlassButton>
                ))}
              </div>
              </div>
              <div className="mt-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Hazard</p>
              <div className="mt-2 space-y-2">
                <GlassButton
                  type="button"
                  onClick={() => {
                    setPlaceHazardMode((v) => !v);
                    setHazardMessage(placeHazardMode ? "Placement cancelled" : "Click map to place hazard");
                  }}
                  borderless={placeHazardMode}
                  rimless={placeHazardMode}
                  className="flex w-full items-center justify-between text-left text-sm"
                  buttonClassName={
                    placeHazardMode
                      ? "h-10 bg-rose-700/90 font-semibold text-white shadow-[inset_0_0_0_1px_rgba(127,29,29,0.65)]"
                      : "h-10 text-slate-900 dark:text-slate-100"
                  }
                >
                  <span className="flex items-center gap-2">
                    <TriangleAlert className="h-4 w-4" />
                    <span>{placeHazardMode ? "Cancel Placement" : "Place Hazard"}</span>
                  </span>
                  <span className="font-mono-display text-xs">{placeHazardMode ? "ARMED" : "IDLE"}</span>
                </GlassButton>
                <label className="block text-xs text-slate-500 dark:text-slate-300">Radius ({hazardRadius}m)</label>
                <input
                  type="range"
                  min={10}
                  max={150}
                  step={5}
                  value={hazardRadius}
                  onChange={(e) => setHazardRadius(Number(e.target.value))}
                  className="w-full cursor-pointer accent-rose-600"
                />
                <GlassButton
                  type="button"
                  onClick={() => {
                    const resetCount = resetSpawnAgentsToNormalRoaming();
                    hazardsRef.current = [];
                    setHazards([]);
                    hazardDynamicsRef.current.clear();
                    syncStoreSnapshot();
                    refreshDeck();
                    setHazardMessage(`All hazards cleared. Spawn reset to normal: ${resetCount}.`);
                  }}
                  className="flex w-full items-center justify-between text-left text-sm text-slate-900 dark:text-slate-100"
                >
                  <span>Clear Hazards</span>
                  <span className="font-mono-display text-xs">{hazards.length}</span>
                </GlassButton>
                <p className="rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">{hazardMessage}</p>
              </div>
              </div>
            </GlassCardContent>
          </GlassCard>
        </aside>

        <aside className={`fixed ${panelTop} right-3 z-30 w-[min(20rem,calc(100vw-1.5rem))] transition-transform ${selectedAgent ? "translate-x-0" : "translate-x-[calc(100%+1rem)]"}`}>
          <GlassCard className="gap-3 py-4 text-slate-900 dark:text-slate-100">
            {selectedAgent && (
              <GlassCardContent className="px-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div><p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300">Agent</p><h2 className="font-mono-display text-2xl text-cyan-700 dark:text-cyan-300">{selectedAgent.id}</h2></div>
                  <GlassButton type="button" onClick={() => { setSelectedIndex(null); setSelectedAgent(null); }} className="text-slate-900 dark:text-slate-100"><X className="h-4 w-4" /><span className="text-xs">Close</span></GlassButton>
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-slate-500 dark:text-slate-300">Sector</dt><dd className="font-mono-display">{selectedAgent.sector}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-slate-500 dark:text-slate-300">Coordinates</dt><dd className="font-mono-display">{selectedAgent.position[1].toFixed(6)}, {selectedAgent.position[0].toFixed(6)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-slate-500 dark:text-slate-300">Speed</dt><dd className="font-mono-display">{selectedAgent.speed.toFixed(2)} m/s</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-slate-500 dark:text-slate-300">Waypoints</dt><dd className="font-mono-display">{selectedAgent.path.length}</dd></div>
                </dl>
              </GlassCardContent>
            )}
          </GlassCard>
        </aside>

      </section>
    </div>
  );
}
