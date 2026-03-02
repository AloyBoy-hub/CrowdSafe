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
import { Link } from "react-router-dom";
import indoorNorthSpineRaw from "../../data/indoor-north-spine.geojson?raw";
import type { Agent as SimAgent, Alert as SimAlert, Exit as SimExit, Hazard as SimHazard } from "../../lib/types";
import {
  CAMERA_DEFAULT_BEARING,
  CAMERA_DEFAULT_PITCH,
  CAMERA_DEFAULT_ZOOM,
  CAMERA_MAX_ZOOM,
  CAMERA_MIN_ZOOM,
  EXIT_POINTS,
  INDOOR_LIGHT_STYLE,
  NTU_BOUNDS_NE,
  NTU_BOUNDS_SW,
  NTU_CENTER,
  OUTDOOR_STANDARD_STYLE,
  OUTDOOR_STREETS_STYLE,
  getMapboxToken
} from "../../lib/mapConfig";
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

type ExitMetricSnapshot = {
  ts: number;
  totalAgents: number;
  queues: number[];
};

const DASHBOARD_EXIT_METRICS_KEY = "campussafe-exit-metrics-v1";

interface UiSnapshot {
  avgDensity: number;
  hotspotSector: string;
  simElapsedSec: number;
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
  showSafetyOverlay: boolean;
}

interface IndoorFeature {
  geometry: { type: string; coordinates: unknown };
  properties?: Record<string, unknown>;
}

interface Hazard {
  id: string;
  lat: number;
  lng: number;
  radiusM: number;
  type: "fire" | "smoke" | "other";
}

const indoorNorthSpine = JSON.parse(indoorNorthSpineRaw) as { features: IndoorFeature[] };

const AGENT_COUNT = 1500;
const STEP_MS = 100;
const HEATMAP_MS = 500;
const UI_MS = 1000;
const HAZARD_EFFECT_RADIUS_M = 50;
const SPAWN_TO_EXIT_SPEED_MIN = 4.0;
const SPAWN_TO_EXIT_SPEED_MAX = 5.0;
const EXIT_TO_DISPERSAL_SPEED_MIN = 1.5;
const EXIT_TO_DISPERSAL_SPEED_MAX = 2.5;
const STORE_SYNC_MS = 250;
const CAPACITY_BY_EXIT = [420, 360, 300];

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

const ALL_SIM_POINTS: LngLat[] = [
  ...SPAWN_POLYGON,
  ...EXIT_POINTS.map((x) => x.coordinate as LngLat),
  ...DISPERSAL_POLYGONS.flat()
];

const SIM_BOUNDS = {
  west: Math.min(NTU_BOUNDS_SW[0], ...ALL_SIM_POINTS.map((x) => x[0])) - 0.0002,
  east: Math.max(NTU_BOUNDS_NE[0], ...ALL_SIM_POINTS.map((x) => x[0])) + 0.0002,
  south: Math.min(NTU_BOUNDS_SW[1], ...ALL_SIM_POINTS.map((x) => x[1])) - 0.0002,
  north: Math.max(NTU_BOUNDS_NE[1], NTU_CENTER[1], ...ALL_SIM_POINTS.map((x) => x[1])) + 0.0002
};

const BUILDING_NAMES = new Set([
  "North Spine",
  "South Spine",
  "NS Central",
  "Lee Wee Nam Library",
  "The Arc",
  "Block N1",
  "Block N2",
  "Block N3",
  "Block N4",
  "LT2A",
  "Tan Chin Tuan Lecture Theatre"
]);

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

function outdoorStyle(v: MapVariant): string {
  return v === "3d" ? OUTDOOR_STANDARD_STYLE : OUTDOOR_STREETS_STYLE;
}

export default function MapView() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const deckRef = useRef<MapboxOverlay | null>(null);
  const indoorMarkersRef = useRef<Marker[]>([]);
  const isIndoorRef = useRef(false);
  const selectedIndexRef = useRef<number | null>(null);
  const layersRef = useRef<LayerSettings>({
    showAgents: true,
    showHeatmap: true,
    showSafetyOverlay: true
  });
  const simStartRef = useRef(Date.now());
  const variantRef = useRef<MapVariant>("2d");
  const posVerRef = useRef(0);

  const idsRef = useRef<string[]>(Array.from({ length: AGENT_COUNT }, (_, i) => `AGT-${String(i + 1).padStart(4, "0")}`));
  const sectorsRef = useRef<string[]>(Array.from({ length: AGENT_COUNT }, () => "Spawn Area"));
  const positionsRef = useRef<Float32Array>(new Float32Array(AGENT_COUNT * 2));
  const speedsRef = useRef<Float32Array>(new Float32Array(AGENT_COUNT));
  const pathsRef = useRef<LngLat[][]>(Array.from({ length: AGENT_COUNT }, () => []));
  const evacuationStateRef = useRef<Uint8Array>(new Uint8Array(AGENT_COUNT));
  const exitTargetIndexRef = useRef<number[]>(Array.from({ length: AGENT_COUNT }, () => -1));
  const frameRef = useRef(0);
  const exitsRef = useRef<SimExit[]>(
    EXIT_POINTS.map((exit, idx) => ({
      id: exit.id,
      name: exit.label,
      lat: exit.coordinate[1],
      lng: exit.coordinate[0],
      capacity: CAPACITY_BY_EXIT[idx] ?? 300,
      queue: 0,
      status: "open",
      override: false
    }))
  );

  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("campuswatch-dark-mode") !== "light");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("campuswatch-sidebar-collapsed") === "true");
  const [variant, setVariant] = useState<MapVariant>("2d");
  const [indoor, setIndoor] = useState(false);
  const [layerSettings, setLayerSettings] = useState<LayerSettings>({
    showAgents: true,
    showHeatmap: true,
    showSafetyOverlay: true
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
  const [ui, setUi] = useState<UiSnapshot>({
    avgDensity: 0,
    hotspotSector: "Spawn Area",
    simElapsedSec: 0
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
      // Dependent layers only make sense when agent dots are enabled.
      if (!prev.showAgents && key !== "showAgents") return prev;

      if (key === "showAgents") {
        const nextShowAgents = !prev.showAgents;
        if (!nextShowAgents) {
          return {
            ...prev,
            showAgents: false,
            showHeatmap: false,
            showSafetyOverlay: false
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

  function exitQueuesByNearestExit(): number[] {
    const queues = new Array(EXIT_POINTS.length).fill(0);
    for (let i = 0; i < AGENT_COUNT; i += 1) {
      const p: LngLat = [positionsRef.current[i * 2], positionsRef.current[i * 2 + 1]];
      queues[nearestExitIndex(p)] += 1;
    }
    return queues;
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

  function rerouteForExitStatusChanges(): void {
    let rerouted = 0;
    for (let i = 0; i < AGENT_COUNT; i += 1) {
      if (evacuationStateRef.current[i] !== 1) continue;
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

  function inDangerZone(point: LngLat): boolean {
    for (const hazard of hazardsRef.current) {
      const d = distM(point, [hazard.lng, hazard.lat]);
      if (d <= Math.max(hazard.radiusM, HAZARD_EFFECT_RADIUS_M)) return true;
    }
    return false;
  }

  function agentStatus(i: number, position: LngLat): SimAgent["status"] {
    const state = evacuationStateRef.current[i];
    if (state === 2) return "safe";
    if (inDangerZone(position)) return "danger";
    if (state === 1) return "evacuating";
    return "normal";
  }

  function agentColor(status: SimAgent["status"]): [number, number, number, number] {
    if (status === "danger") return [239, 68, 68, 245];
    if (status === "evacuating") return [251, 191, 36, 235];
    if (status === "safe") return [52, 211, 153, 225];
    return [0, 0, 0, 220];
  }

  function currentEtaSeconds(i: number): number | null {
    if (evacuationStateRef.current[i] !== 1) return null;
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
    const queueByExit = new Array(exitsRef.current.length).fill(0);

    for (let i = 0; i < AGENT_COUNT; i += 1) {
      const position: LngLat = [positionsRef.current[i * 2], positionsRef.current[i * 2 + 1]];
      const state = evacuationStateRef.current[i];
      const status = agentStatus(i, position);
      const eta = currentEtaSeconds(i);
      const exitIdx = exitTargetIndexRef.current[i];
      const exitTarget = state === 1 && exitIdx >= 0 ? exitsRef.current[exitIdx]?.id ?? null : null;
      if (state === 1 && exitIdx >= 0) {
        queueByExit[exitIdx] += 1;
      } else {
        const nearestIdx = nearestExitIndex(position);
        const nearestDist = distM(position, [exitsRef.current[nearestIdx].lng, exitsRef.current[nearestIdx].lat]);
        if (nearestDist <= 30) queueByExit[nearestIdx] += 1;
      }

      agentPayload.push({
        id: idsRef.current[i],
        lat: position[1],
        lng: position[0],
        status,
        sector: 1,
        exit_target: exitTarget,
        path_eta_s: eta
      });
    }

    exitsRef.current = exitsRef.current.map((exit, idx) => ({
      ...exit,
      queue: queueByExit[idx] ?? 0
    }));

    const hazardsPayload: SimHazard[] = hazardsRef.current.map((h) => ({
      id: h.id,
      lat: h.lat,
      lng: h.lng,
      radius_m: h.radiusM,
      type: h.type
    }));

    frameRef.current += 1;
    useSimStore.setState({ frame: frameRef.current });
    setAgentsStore(agentPayload);
    setExitsStore(exitsRef.current);
    setHazardsStore(hazardsPayload);
  }

  function applyHazardEvacuation(hazard: Hazard): number {
    let affected = 0;
    const hazardPoint: LngLat = [hazard.lng, hazard.lat];

    for (let i = 0; i < AGENT_COUNT; i += 1) {
      if (evacuationStateRef.current[i] === 2) continue;

      const current: LngLat = [positionsRef.current[i * 2], positionsRef.current[i * 2 + 1]];
      const distance = distM(current, hazardPoint);
      if (distance > HAZARD_EFFECT_RADIUS_M) continue;

      affected += 1;
      evacuationStateRef.current[i] = 1;
      speedsRef.current[i] = rand(SPAWN_TO_EXIT_SPEED_MIN, SPAWN_TO_EXIT_SPEED_MAX);

      const exitIdx = nearestAvailableExitIndex(current);
      exitTargetIndexRef.current[i] = exitIdx;
      const exitTarget = EXIT_POINTS[exitIdx].coordinate as LngLat;
      pathsRef.current[i] = [exitTarget];
    }

    if (affected > 0) posVerRef.current += 1;
    return affected;
  }

  variantRef.current = variant;
  isIndoorRef.current = indoor;
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

  const areaPer100 = useMemo(() => {
    const width = (SIM_BOUNDS.east - SIM_BOUNDS.west) * 111320 * Math.cos(((SIM_BOUNDS.south + SIM_BOUNDS.north) * 0.5 * Math.PI) / 180);
    const height = (SIM_BOUNDS.north - SIM_BOUNDS.south) * 110540;
    return Math.max(1, (width * height) / 100);
  }, []);

  function normalPath(): LngLat[] {
    const n = 2 + Math.floor(Math.random() * 3);
    return Array.from({ length: n }, () => samplePointInPolygon(SPAWN_POLYGON));
  }

  function dispersalPath(): LngLat[] {
    const polygon = DISPERSAL_POLYGONS[Math.floor(Math.random() * DISPERSAL_POLYGONS.length)];
    const n = 4 + Math.floor(Math.random() * 4);
    return Array.from({ length: n }, () => samplePointInPolygon(polygon));
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
      speedsRef.current[i] = rand(0.8, 1.4);
      pathsRef.current[i] = normalPath();
      evacuationStateRef.current[i] = 0;
      exitTargetIndexRef.current[i] = -1;
    }
    posVerRef.current += 1;
  }

  function clearMarkers() {
    for (const m of indoorMarkersRef.current) m.remove();
    indoorMarkersRef.current = [];
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
            if (!layersRef.current.showSafetyOverlay) return [0, 0, 0, 220];
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

    const hm = layersRef.current.showHeatmap && !isIndoorRef.current ? "visible" : "none";
    const haz = !isIndoorRef.current ? "visible" : "none";

    if (
      !map.getLayer("agent-heatmap") ||
      !map.getLayer("hazards-fill") ||
      !map.getLayer("hazards-outline")
    ) {
      addOutdoorLayers(map);
    }

    if (map.getLayer("agent-heatmap")) {
      map.setLayoutProperty("agent-heatmap", "visibility", hm);
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

    const orderedLayerIds = ["agent-heatmap", "hazards-fill", "hazards-outline"];

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
    clearMarkers();

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
            layout: { visibility: layersRef.current.showHeatmap && !isIndoorRef.current ? "visible" : "none" }
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
          layout: { visibility: !isIndoorRef.current ? "visible" : "none" }
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
          layout: { visibility: !isIndoorRef.current ? "visible" : "none" }
        });
      } catch {
        // no-op
      }
    }

    for (const exit of EXIT_POINTS) {
      indoorMarkersRef.current.push(new mapboxgl.Marker({ element: exitMarkerEl(exit.label) }).setLngLat(exit.coordinate).addTo(map));
    }
    refreshMapLayerVisibility();
  }
  function indoorMarkerEl(name: string): HTMLDivElement {
    const el = document.createElement("div");
    el.className = "h-3 w-3 rounded-full bg-cyan-400 shadow-[0_0_0_4px_rgba(34,211,238,0.22)]";
    el.title = name;
    return el;
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

  function addIndoorLayers(map: mapboxgl.Map) {
    if (!map.getSource("indoor-src")) map.addSource("indoor-src", { type: "geojson", data: indoorNorthSpine as never });
    if (!map.getLayer("indoor-fill")) {
      map.addLayer({
        id: "indoor-fill",
        type: "fill",
        source: "indoor-src",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: {
          "fill-opacity": 0.75,
          "fill-color": [
            "match",
            ["get", "category"],
            "lecture_theatre",
            "#1e3a5f",
            "library",
            "#1a3a2a",
            "learning_hub",
            "#2d1b4e",
            "academic",
            "#1e293b",
            "school",
            "#2a1f10",
            "research",
            "#1f1f2e",
            "corridor_building",
            "#0f172a",
            "#1e293b"
          ]
        }
      });
    }
    if (!map.getLayer("indoor-border")) {
      map.addLayer({
        id: "indoor-border",
        type: "line",
        source: "indoor-src",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "line-color": "#334155", "line-width": 1 }
      });
    }
    if (!map.getLayer("indoor-lines")) {
      map.addLayer({
        id: "indoor-lines",
        type: "line",
        source: "indoor-src",
        filter: ["==", ["geometry-type"], "LineString"],
        paint: { "line-color": "#64748b", "line-width": 2, "line-dasharray": [3, 2] }
      });
    }
    if (!map.getLayer("indoor-label")) {
      map.addLayer({
        id: "indoor-label",
        type: "symbol",
        source: "indoor-src",
        layout: { "text-field": ["coalesce", ["get", "name"], ""], "text-size": 10, "text-font": ["DM Mono Regular", "Arial Unicode MS Regular"] },
        paint: { "text-color": "#94a3b8" }
      });
    }
    clearMarkers();
    const features = indoorNorthSpine.features;
    for (const f of features) {
      if (f.geometry.type !== "Point") continue;
      const c = f.geometry.coordinates as [number, number];
      const n = String(f.properties?.name ?? "Point");
      indoorMarkersRef.current.push(new mapboxgl.Marker({ element: indoorMarkerEl(n) }).setLngLat(c).addTo(map));
    }
  }

  function backToCampus() {
    const map = mapRef.current;
    if (!map) return;
    setIndoor(false);
    map.setStyle(outdoorStyle(variantRef.current));
    map.once("style.load", () => {
      map.flyTo({ center: NTU_CENTER, zoom: CAMERA_DEFAULT_ZOOM, pitch: CAMERA_DEFAULT_PITCH, bearing: CAMERA_DEFAULT_BEARING, duration: 900 });
    });
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
      center: NTU_CENTER,
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
      if (isIndoorRef.current) addIndoorLayers(map);
      else addOutdoorLayers(map);
      refreshMapLayerVisibility();
      raiseCoverageLayers();
      refreshDeck();
    });
    map.on("load", () => {
      if (isIndoorRef.current) addIndoorLayers(map);
      else addOutdoorLayers(map);
      refreshMapLayerVisibility();
      raiseCoverageLayers();
      refreshDeck();
    });
    map.on("click", (e: MapLayerMouseEvent) => {
      if (placeHazardModeRef.current && !isIndoorRef.current) {
        const newHazard: Hazard = {
          id: `h-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          lat: e.lngLat.lat,
          lng: e.lngLat.lng,
          radiusM: hazardRadiusRef.current,
          type: "fire"
        };
        const affected = applyHazardEvacuation(newHazard);
        setHazards((prev) => [...prev, newHazard]);
        setHazardMessage(`Hazard added (${newHazard.radiusM}m). Evacuating: ${affected}`);
        appendAlert({
          id: `al-hazard-${Date.now()}`,
          ts: Date.now(),
          reason: "hazard_added",
          old_exit: null,
          new_exit: null,
          affected
        });
        syncStoreSnapshot();
        refreshDeck();
        return;
      }
      if (isIndoorRef.current) return;
      const match = map.queryRenderedFeatures(e.point, { layers: ["building"] }).find((f) => BUILDING_NAMES.has(String(f.properties?.name ?? f.properties?.name_en ?? "").trim()));
      if (!match) return;
      setIndoor(true);
      map.flyTo({ center: [e.lngLat.lng, e.lngLat.lat], zoom: 19, pitch: 0, bearing: 0, duration: 900 });
      map.setStyle(INDOOR_LIGHT_STYLE);
    });
    return () => {
      clearMarkers();
      overlay.finalize();
      map.remove();
    };
  }, []);

  useEffect(() => {
    refreshMapLayerVisibility();
    refreshDeck();
  }, [layerSettings, indoor, selectedIndex]);

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
    if (!map.getLayer("agent-heatmap") || !map.getLayer("hazards-fill") || !map.getLayer("hazards-outline")) {
      addOutdoorLayers(map);
    }
    raiseCoverageLayers();
    refreshMapLayerVisibility();
  }, [hazardGeoJson, heatmapGeoJson]);

  useEffect(() => {
    syncStoreSnapshot();
  }, [hazards]);

  useEffect(() => {
    if (indoor) return;
    mapRef.current?.setStyle(outdoorStyle(variant));
  }, [variant, indoor]);

  useEffect(() => {
    const sim = window.setInterval(() => {
      let moved = false;
      for (let i = 0; i < AGENT_COUNT; i += 1) {
        const cur: LngLat = [positionsRef.current[i * 2], positionsRef.current[i * 2 + 1]];
        if (pathsRef.current[i].length === 0) {
          if (evacuationStateRef.current[i] === 1) {
            const exitIdx = exitTargetIndexRef.current[i] >= 0 ? exitTargetIndexRef.current[i] : nearestAvailableExitIndex(cur);
            exitTargetIndexRef.current[i] = exitIdx;
            pathsRef.current[i] = [EXIT_POINTS[exitIdx].coordinate as LngLat];
          } else if (evacuationStateRef.current[i] === 2) {
            pathsRef.current[i] = dispersalPath();
          } else {
            pathsRef.current[i] = normalPath();
          }
        }
        if (pathsRef.current[i].length === 0) continue;
        const target = pathsRef.current[i][0];
        const d = distM(cur, target);
        const step = speedsRef.current[i] * (STEP_MS / 1000);
        const next = d <= step ? target : clamp([cur[0] + ((target[0] - cur[0]) * step) / d, cur[1] + ((target[1] - cur[1]) * step) / d]);
        positionsRef.current[i * 2] = next[0];
        positionsRef.current[i * 2 + 1] = next[1];
        moved = true;
        if (d <= step || distM(next, target) < 1.2) {
          pathsRef.current[i].shift();
          if (evacuationStateRef.current[i] === 1 && pathsRef.current[i].length === 0) {
            evacuationStateRef.current[i] = 2;
            speedsRef.current[i] = rand(EXIT_TO_DISPERSAL_SPEED_MIN, EXIT_TO_DISPERSAL_SPEED_MAX);
            pathsRef.current[i] = dispersalPath();
          }
        }
      }
      if (moved) posVerRef.current += 1;
      refreshDeck();
    }, STEP_MS);

    const heat = window.setInterval(() => setHeatmapRev((x) => x + 1), HEATMAP_MS);
    const sync = window.setInterval(() => syncStoreSnapshot(), STORE_SYNC_MS);
    const uiTimer = window.setInterval(() => {
      const sectorCounts = new Map<string, number>();
      const nextCounts: AgentStatusCounts = { normal: 0, evacuating: 0, safe: 0, danger: 0 };
      for (let i = 0; i < AGENT_COUNT; i += 1) {
        sectorCounts.set(sectorsRef.current[i], (sectorCounts.get(sectorsRef.current[i]) ?? 0) + 1);
        const p: LngLat = [positionsRef.current[i * 2], positionsRef.current[i * 2 + 1]];
        const status = agentStatus(i, p);
        nextCounts[status] += 1;
      }
      const queues = exitQueuesByNearestExit();
      const exitSnapshot: ExitMetricSnapshot = {
        ts: Date.now(),
        totalAgents: AGENT_COUNT,
        queues
      };
      let hotspot = "Spawn Area";
      let c = -1;
      for (const [s, n] of sectorCounts.entries()) if (n > c) { c = n; hotspot = s; }
      localStorage.setItem(DASHBOARD_EXIT_METRICS_KEY, JSON.stringify(exitSnapshot));
      setUi({
        avgDensity: Number((AGENT_COUNT / areaPer100).toFixed(2)),
        hotspotSector: hotspot,
        simElapsedSec: Math.floor((Date.now() - simStartRef.current) / 1000)
      });
      setStatusCounts(nextCounts);
      if (selectedIndexRef.current !== null) setSelectedAgent(snapshot(selectedIndexRef.current));
    }, UI_MS);
    return () => { window.clearInterval(sim); window.clearInterval(heat); window.clearInterval(sync); window.clearInterval(uiTimer); };
  }, [areaPer100]);

  const sideTop = "top-16";
  const panelTop = "top-16";

  return (
    <div className={darkMode ? "dark" : ""}>
      <section className="relative h-screen w-screen overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
        <div ref={mapContainerRef} className="absolute inset-0" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/25 via-transparent to-slate-950/45" />

        <header className="fixed left-0 right-0 top-0 z-40 m-3 flex h-14 items-center justify-between rounded-xl border border-slate-300 bg-slate-100/95 px-3 text-slate-900 shadow-lg shadow-cyan-900/20 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 sm:px-4 md:px-6 lg:px-8 xl:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex items-center gap-2 rounded-md bg-slate-200 px-2 py-1 text-cyan-700 dark:bg-slate-800 dark:text-cyan-300">
              <Shield className="h-4 w-4" />
              <span className="font-mono-display text-sm">CrowdSafe</span>
            </div>
            <div className="hidden items-center gap-2 text-xs text-slate-600 dark:text-slate-300 sm:flex md:gap-3 lg:text-sm">
              <span className="flex items-center gap-1"><Users className="h-4 w-4 text-cyan-500 dark:text-cyan-300" />Total <span className="font-mono-display text-slate-900 dark:text-slate-100">{AGENT_COUNT.toLocaleString()}</span></span>
              <span className="rounded border border-slate-300 bg-white/80 px-2 py-0.5 text-[11px] dark:border-slate-700 dark:bg-slate-800/80"><span className="font-semibold text-slate-600 dark:text-slate-300">Normal</span> <span className="font-mono-display text-slate-900 dark:text-slate-100">{statusCounts.normal.toLocaleString()}</span></span>
              <span className="rounded border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[11px]"><span className="font-semibold text-amber-300">Evacuating</span> <span className="font-mono-display text-amber-200">{statusCounts.evacuating.toLocaleString()}</span></span>
              <span className="rounded border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-[11px]"><span className="font-semibold text-emerald-300">Safe</span> <span className="font-mono-display text-emerald-200">{statusCounts.safe.toLocaleString()}</span></span>
              <span className="rounded border border-rose-500/50 bg-rose-500/10 px-2 py-0.5 text-[11px]"><span className="font-semibold text-rose-300">Danger</span> <span className="font-mono-display text-rose-200">{statusCounts.danger.toLocaleString()}</span></span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSidebarCollapsed((x) => !x)} className="ui-button flex items-center border border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:hidden">
              {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
            <div className="hidden items-center rounded-md border border-slate-300 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800 sm:flex">
              <button type="button" onClick={() => setVariant("2d")} className={`ui-button flex items-center gap-1 border ${variant === "2d" ? "border-cyan-500 bg-cyan-600 text-slate-950" : "border-transparent bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-100"}`}><MapIcon className="h-4 w-4" /><span className="text-xs">2D</span></button>
              <button type="button" onClick={() => setVariant("3d")} className={`ui-button flex items-center gap-1 border ${variant === "3d" ? "border-cyan-500 bg-cyan-600 text-slate-950" : "border-transparent bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-100"}`}><MapIcon className="h-4 w-4" /><span className="text-xs">3D</span></button>
            </div>
            <button type="button" onClick={() => setDarkMode((x) => !x)} className="ui-button flex items-center gap-1 border border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span className="hidden text-xs sm:inline">{darkMode ? "Light" : "Dark"}</span>
            </button>
            <Link to="/dashboard" className="ui-button flex items-center gap-1 border border-slate-300 bg-white text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"><Layers className="h-4 w-4" />Dashboard</Link>
          </div>
        </header>

        <aside className={`ui-card fixed ${sideTop} left-3 z-30 w-[min(18rem,calc(100vw-1.5rem))] border-slate-300 bg-slate-100/95 p-4 text-slate-900 transition-transform dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 sm:w-72 sm:translate-x-0 ${sidebarCollapsed ? "-translate-x-[calc(100%+1rem)]" : "translate-x-0"}`}>
          <div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Layers</p>
              <div className="mt-2 space-y-2">
                {[
                  ["showAgents", "Agent Dots"],
                  ["showHeatmap", "Density Heatmap"],
                  ["showSafetyOverlay", "Safety Overlay"]
                ].map(([key, label]) => (
                  <button key={key} type="button" onClick={() => toggleLayer(key as keyof LayerSettings)} className="ui-button flex w-full items-center justify-between border border-slate-300 bg-white text-left text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                    <span className="flex items-center gap-2">
                      <span className={`flex h-5 w-5 items-center justify-center rounded border ${(layerSettings[key as keyof LayerSettings] as boolean) ? "border-cyan-400 bg-cyan-500/20 text-cyan-300" : "border-slate-600 bg-slate-900 text-slate-500"}`}><Check className="h-3 w-3" /></span>
                      <span>{label}</span>
                    </span>
                    <span className="font-mono-display text-xs text-slate-400">{(layerSettings[key as keyof LayerSettings] as boolean) ? "ON" : "OFF"}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Hazard</p>
              <div className="mt-2 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setPlaceHazardMode((v) => !v);
                    setHazardMessage(placeHazardMode ? "Placement cancelled" : "Click map to place hazard");
                  }}
                  className={`ui-button flex w-full items-center justify-between border text-left text-sm ${
                    placeHazardMode
                      ? "border-rose-500/60 bg-rose-600 text-white"
                      : "border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <TriangleAlert className="h-4 w-4" />
                    <span>{placeHazardMode ? "Cancel Placement" : "Place Hazard"}</span>
                  </span>
                  <span className="font-mono-display text-xs">{placeHazardMode ? "ARMED" : "IDLE"}</span>
                </button>
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
                <button
                  type="button"
                  onClick={() => {
                    setHazards([]);
                    setHazardMessage("All hazards cleared");
                  }}
                  className="ui-button flex w-full items-center justify-between border border-slate-300 bg-white text-left text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <span>Clear Hazards</span>
                  <span className="font-mono-display text-xs">{hazards.length}</span>
                </button>
                <p className="rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">{hazardMessage}</p>
              </div>
            </div>
          </div>
        </aside>

        <aside className={`ui-card fixed ${panelTop} right-3 z-30 w-[min(20rem,calc(100vw-1.5rem))] border-slate-300 bg-slate-100/95 p-4 text-slate-900 transition-transform dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 ${selectedAgent ? "translate-x-0" : "translate-x-[calc(100%+1rem)]"}`}>
          {selectedAgent && (
            <>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div><p className="text-xs uppercase tracking-wide text-slate-400">Agent</p><h2 className="font-mono-display text-2xl text-cyan-300">{selectedAgent.id}</h2></div>
                <button type="button" onClick={() => { setSelectedIndex(null); setSelectedAgent(null); }} className="ui-button flex items-center gap-1 border border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"><X className="h-4 w-4" /><span className="text-xs">Close</span></button>
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-slate-400">Sector</dt><dd className="font-mono-display">{selectedAgent.sector}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-400">Coordinates</dt><dd className="font-mono-display">{selectedAgent.position[1].toFixed(6)}, {selectedAgent.position[0].toFixed(6)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-400">Speed</dt><dd className="font-mono-display">{selectedAgent.speed.toFixed(2)} m/s</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-400">Waypoints</dt><dd className="font-mono-display">{selectedAgent.path.length}</dd></div>
              </dl>
            </>
          )}
        </aside>

        {indoor && <button type="button" onClick={backToCampus} className="ui-button fixed left-3 top-16 z-40 flex items-center gap-2 border border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"><ChevronLeft className="h-4 w-4" />Back to Campus</button>}
      </section>
    </div>
  );
}




