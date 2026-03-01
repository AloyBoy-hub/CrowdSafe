import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import { LineLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import { MapboxOverlay } from "@deck.gl/mapbox";
import {
  AlertTriangle,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Layers,
  Map as MapIcon,
  Moon,
  Pause,
  Play,
  RotateCcw,
  Route,
  Search,
  Shield,
  Sun,
  Users,
  X
} from "lucide-react";
import mapboxgl, { type MapLayerMouseEvent, type Marker } from "mapbox-gl";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Link } from "react-router-dom";
import indoorNorthSpineRaw from "../../data/indoor-north-spine.geojson?raw";
import { CAMPUS_WALKWAYS } from "../../data/campusWalkways";
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

type LngLat = [number, number];
type AgentStatus = "normal" | "evacuating" | "safe" | "danger";
type MapVariant = "2d" | "3d";

interface Agent {
  id: string;
  position: [number, number];
  status: AgentStatus;
  sector: string;
  speed: number;
  path: [number, number][];
  eta: number | null;
}

interface UiSnapshot {
  evacuating: number;
  safe: number;
  danger: number;
  avgDensity: number;
  hotspotSector: string;
  simElapsedSec: number;
  evacuationElapsedSec: number;
}

interface LayerSettings {
  showAgents: boolean;
  showHeatmap: boolean;
  showWalkways: boolean;
  show3dBuildings: boolean;
}

interface IndoorFeature {
  geometry: { type: string; coordinates: unknown };
  properties?: Record<string, unknown>;
}

const indoorNorthSpine = JSON.parse(indoorNorthSpineRaw) as { features: IndoorFeature[] };

const AGENT_COUNT = 5000;
const STEP_MS = 100;
const HEATMAP_MS = 500;
const UI_MS = 1000;
const EVAC_STAGGER_MS = 3000;

const STATUS_CODE = { normal: 0, evacuating: 1, safe: 2, danger: 3 } as const;
const STATUS_FROM_CODE: AgentStatus[] = ["normal", "evacuating", "safe", "danger"];
const STATUS_META: Record<AgentStatus, { label: string; badge: string; mapColor: [number, number, number, number] }> = {
  normal: { label: "Normal", badge: "bg-emerald-500/20 text-emerald-300", mapColor: [0, 0, 0, 220] },
  evacuating: { label: "Evacuating", badge: "bg-amber-500/20 text-amber-300", mapColor: [251, 191, 36, 220] },
  safe: { label: "Safe", badge: "bg-emerald-600/20 text-emerald-300", mapColor: [52, 211, 153, 220] },
  danger: { label: "Danger", badge: "bg-rose-600/20 text-rose-300", mapColor: [239, 68, 68, 255] }
};

const SIM_BOUNDS = {
  west: Math.min(NTU_BOUNDS_SW[0], ...EXIT_POINTS.map((x) => x.coordinate[0])),
  east: Math.max(NTU_BOUNDS_NE[0], ...EXIT_POINTS.map((x) => x.coordinate[0])),
  south: Math.min(NTU_BOUNDS_SW[1], ...EXIT_POINTS.map((x) => x.coordinate[1])),
  north: Math.max(NTU_BOUNDS_NE[1], NTU_CENTER[1], ...EXIT_POINTS.map((x) => x.coordinate[1]))
};

const HOTSPOTS = [
  { sector: "North Spine", center: [103.6836, 1.3415] as LngLat, w: 0.3, dlng: 0.0013, dlat: 0.001 },
  { sector: "South Spine", center: [103.6812, 1.3362] as LngLat, w: 0.2, dlng: 0.0014, dlat: 0.0011 },
  { sector: "Lecture Theatres", center: [103.6844, 1.3385] as LngLat, w: 0.16, dlng: 0.001, dlat: 0.0009 },
  { sector: "Hall 1", center: [103.6852, 1.3346] as LngLat, w: 0.12, dlng: 0.0009, dlat: 0.0012 },
  { sector: "Sports Complex", center: [103.681, 1.3306] as LngLat, w: 0.12, dlng: 0.0012, dlat: 0.0012 },
  { sector: "Library Belt", center: [103.6829, 1.3406] as LngLat, w: 0.1, dlng: 0.001, dlat: 0.0008 }
];

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

function hms(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function outdoorStyle(v: MapVariant): string {
  return v === "3d" ? OUTDOOR_STANDARD_STYLE : OUTDOOR_STREETS_STYLE;
}

function statusIcon(status: AgentStatus) {
  if (status === "safe") return Check;
  if (status === "evacuating") return Route;
  if (status === "danger") return AlertTriangle;
  return Shield;
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
    showWalkways: true,
    show3dBuildings: true
  });
  const pausedRef = useRef(false);
  const evacRef = useRef(false);
  const evacStartRef = useRef<number | null>(null);
  const simStartRef = useRef(Date.now());
  const variantRef = useRef<MapVariant>("2d");
  const posVerRef = useRef(0);
  const statusVerRef = useRef(0);

  const idsRef = useRef<string[]>(Array.from({ length: AGENT_COUNT }, (_, i) => `AGT-${String(i + 1).padStart(4, "0")}`));
  const sectorsRef = useRef<string[]>(Array.from({ length: AGENT_COUNT }, () => "North Spine"));
  const positionsRef = useRef<Float32Array>(new Float32Array(AGENT_COUNT * 2));
  const speedsRef = useRef<Float32Array>(new Float32Array(AGENT_COUNT));
  const statusesRef = useRef<Uint8Array>(new Uint8Array(AGENT_COUNT));
  const etaRef = useRef<Float32Array>(new Float32Array(AGENT_COUNT).fill(-1));
  const exitsRef = useRef<Int16Array>(new Int16Array(AGENT_COUNT).fill(-1));
  const delayRef = useRef<Uint16Array>(new Uint16Array(AGENT_COUNT));
  const pathsRef = useRef<LngLat[][]>(Array.from({ length: AGENT_COUNT }, () => []));

  const [playback, setPlayback] = useReducer(
    (state: { paused: boolean }, action: "play" | "pause" | "reset") => {
      if (action === "play") return { paused: false };
      if (action === "pause") return { paused: true };
      return { paused: false };
    },
    { paused: false }
  );
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("campuswatch-dark-mode") !== "light");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("campuswatch-sidebar-collapsed") === "true");
  const [evacuation, setEvacuation] = useState(false);
  const [variant, setVariant] = useState<MapVariant>("2d");
  const [indoor, setIndoor] = useState(false);
  const [layerSettings, setLayerSettings] = useState<LayerSettings>({
    showAgents: true,
    showHeatmap: true,
    showWalkways: true,
    show3dBuildings: true
  });
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [lookup, setLookup] = useState("");
  const [lookupErr, setLookupErr] = useState<string | null>(null);
  const [heatmapRev, setHeatmapRev] = useState(0);
  const [ui, setUi] = useState<UiSnapshot>({
    evacuating: 0,
    safe: 0,
    danger: 0,
    avgDensity: 0,
    hotspotSector: "North Spine",
    simElapsedSec: 0,
    evacuationElapsedSec: 0
  });

  variantRef.current = variant;
  isIndoorRef.current = indoor;
  selectedIndexRef.current = selectedIndex;
  layersRef.current = layerSettings;
  pausedRef.current = playback.paused;
  evacRef.current = evacuation;

  const heatmapData = useMemo(() => {
    const data: { position: LngLat; weight: number }[] = [];
    for (let i = 0; i < AGENT_COUNT; i += 1) {
      data.push({ position: [positionsRef.current[i * 2], positionsRef.current[i * 2 + 1]], weight: 1 });
    }
    return data;
  }, [heatmapRev]);
  const heatmapRef = useRef(heatmapData);
  heatmapRef.current = heatmapData;

  const areaPer100 = useMemo(() => {
    const width = (SIM_BOUNDS.east - SIM_BOUNDS.west) * 111320 * Math.cos(((SIM_BOUNDS.south + SIM_BOUNDS.north) * 0.5 * Math.PI) / 180);
    const height = (SIM_BOUNDS.north - SIM_BOUNDS.south) * 110540;
    return Math.max(1, (width * height) / 100);
  }, []);

  function pickHotspot() {
    const r = Math.random();
    let acc = 0;
    for (const h of HOTSPOTS) {
      acc += h.w;
      if (r <= acc) return h;
    }
    return HOTSPOTS[HOTSPOTS.length - 1];
  }

  function normalPath(sector: string): LngLat[] {
    const h = HOTSPOTS.find((x) => x.sector === sector) ?? HOTSPOTS[0];
    const n = 2 + Math.floor(Math.random() * 3);
    return Array.from({ length: n }, () => clamp([h.center[0] + rand(-h.dlng, h.dlng), h.center[1] + rand(-h.dlat, h.dlat)]));
  }

  function nearestExit(p: LngLat): number {
    let idx = 0;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < EXIT_POINTS.length; i += 1) {
      const d = distM(p, EXIT_POINTS[i].coordinate);
      if (d < best) {
        best = d;
        idx = i;
      }
    }
    return idx;
  }

  function snapshot(i: number): Agent {
    const eta = etaRef.current[i];
    return {
      id: idsRef.current[i],
      position: [positionsRef.current[i * 2], positionsRef.current[i * 2 + 1]],
      status: STATUS_FROM_CODE[statusesRef.current[i]],
      sector: sectorsRef.current[i],
      speed: Number(speedsRef.current[i].toFixed(2)),
      path: [...pathsRef.current[i]],
      eta: eta >= 0 ? Math.round(eta) : null
    };
  }

  function initAgents(initialDistribution: boolean): void {
    for (let i = 0; i < AGENT_COUNT; i += 1) {
      const h = pickHotspot();
      const p = clamp([h.center[0] + rand(-h.dlng, h.dlng), h.center[1] + rand(-h.dlat, h.dlat)]);
      positionsRef.current[i * 2] = p[0];
      positionsRef.current[i * 2 + 1] = p[1];
      sectorsRef.current[i] = h.sector;
      delayRef.current[i] = Math.floor(rand(0, EVAC_STAGGER_MS));
      exitsRef.current[i] = -1;
      etaRef.current[i] = -1;

      if (!initialDistribution) {
        statusesRef.current[i] = STATUS_CODE.normal;
        speedsRef.current[i] = rand(0.8, 1.4);
        pathsRef.current[i] = normalPath(h.sector);
        continue;
      }

      const r = Math.random();
      if (r < 0.95) {
        statusesRef.current[i] = STATUS_CODE.normal;
        speedsRef.current[i] = rand(0.8, 1.4);
        pathsRef.current[i] = normalPath(h.sector);
      } else if (r < 0.98) {
        statusesRef.current[i] = STATUS_CODE.danger;
        speedsRef.current[i] = 0;
        pathsRef.current[i] = [];
      } else {
        statusesRef.current[i] = STATUS_CODE.safe;
        speedsRef.current[i] = 0;
        pathsRef.current[i] = [];
      }
    }
    posVerRef.current += 1;
    statusVerRef.current += 1;
  }

  function clearMarkers() {
    for (const m of indoorMarkersRef.current) m.remove();
    indoorMarkersRef.current = [];
  }

  function refreshDeck() {
    const overlay = deckRef.current;
    if (!overlay) return;
    const pulse = 170 + Math.round((Math.sin(Date.now() / 250) + 1) * 42);
    const layers: unknown[] = [];
    if (layersRef.current.showHeatmap) {
      layers.push(
        new HeatmapLayer({
          id: "heat",
          data: heatmapRef.current,
          radiusPixels: 30,
          intensity: 1,
          threshold: 0.03,
          colorRange: [
            [0, 0, 0, 0],
            [59, 130, 246, 190],
            [234, 179, 8, 220],
            [239, 68, 68, 240]
          ],
          getPosition: (d: { position: LngLat }) => d.position,
          getWeight: (d: { weight: number }) => d.weight
        })
      );
    }
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
          getFillColor: (i) => (STATUS_FROM_CODE[statusesRef.current[i]] === "danger" ? [239, 68, 68, pulse] : STATUS_META[STATUS_FROM_CODE[statusesRef.current[i]]].mapColor),
          onClick: (info: PickingInfo<number>) => {
            if (typeof info.index === "number" && info.index >= 0) {
              setSelectedIndex(info.index);
              setSelectedAgent(snapshot(info.index));
            }
          },
          updateTriggers: { getPosition: [posVerRef.current], getFillColor: [statusVerRef.current, pulse] }
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
    const walk = layersRef.current.showWalkways && !isIndoorRef.current ? "visible" : "none";
    const bld = layersRef.current.show3dBuildings && !isIndoorRef.current ? "visible" : "none";
    if (map.getLayer("walkways-layer")) map.setLayoutProperty("walkways-layer", "visibility", walk);
    if (map.getLayer("buildings-extrusion")) map.setLayoutProperty("buildings-extrusion", "visibility", bld);
  }

  function addOutdoorLayers(map: mapboxgl.Map) {
    clearMarkers();
    if (!map.getSource("walkways-src")) map.addSource("walkways-src", { type: "geojson", data: CAMPUS_WALKWAYS as never });
    if (!map.getLayer("walkways-layer")) {
      map.addLayer({
        id: "walkways-layer",
        type: "line",
        source: "walkways-src",
        paint: { "line-color": "#334155", "line-width": 2, "line-dasharray": [2, 2] }
      });
    }
    if (!map.getLayer("buildings-extrusion")) {
      const before = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
      map.addLayer(
        {
          id: "buildings-extrusion",
          type: "fill-extrusion",
          source: "composite",
          "source-layer": "building",
          filter: ["==", ["get", "extrude"], "true"],
          minzoom: 15,
          paint: {
            "fill-extrusion-color": "#1e293b",
            "fill-extrusion-height": ["coalesce", ["get", "height"], 8],
            "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
            "fill-extrusion-opacity": 0.85
          }
        },
        before
      );
    }
    refreshMapLayerVisibility();
  }

  function markerEl(name: string): HTMLDivElement {
    const el = document.createElement("div");
    el.className = "h-3 w-3 rounded-full bg-cyan-400 shadow-[0_0_0_4px_rgba(34,211,238,0.22)]";
    el.title = name;
    return el;
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
      indoorMarkersRef.current.push(new mapboxgl.Marker({ element: markerEl(n) }).setLngLat(c).addTo(map));
    }
  }

  function triggerEvacuation() {
    evacStartRef.current = Date.now();
    setEvacuation(true);
    for (let i = 0; i < AGENT_COUNT; i += 1) delayRef.current[i] = Math.floor(rand(0, EVAC_STAGGER_MS));
  }

  function cancelEvacuation() {
    setEvacuation(false);
    evacStartRef.current = null;
    initAgents(false);
    refreshDeck();
  }

  function resetAll() {
    setEvacuation(false);
    evacStartRef.current = null;
    simStartRef.current = Date.now();
    setPlayback("reset");
    setSelectedIndex(null);
    setSelectedAgent(null);
    initAgents(true);
    refreshDeck();
  }

  function locateAgent() {
    const id = lookup.trim().toUpperCase();
    if (!id) {
      setLookupErr("Enter AGT-0123 format.");
      return;
    }
    const idx = idsRef.current.indexOf(id);
    if (idx < 0) {
      setLookupErr("Agent not found.");
      return;
    }
    setLookupErr(null);
    setSelectedIndex(idx);
    setSelectedAgent(snapshot(idx));
    mapRef.current?.flyTo({ center: [positionsRef.current[idx * 2], positionsRef.current[idx * 2 + 1]], zoom: Math.max(17, mapRef.current.getZoom()), duration: 600 });
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
    initAgents(true);
    refreshDeck();
  }, []);

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
    const overlay = new MapboxOverlay({ interleaved: true, layers: [] });
    deckRef.current = overlay;
    map.addControl(overlay);
    map.on("style.load", () => {
      if (isIndoorRef.current) addIndoorLayers(map);
      else addOutdoorLayers(map);
      refreshMapLayerVisibility();
      refreshDeck();
    });
    map.on("click", (e: MapLayerMouseEvent) => {
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
    if (indoor) return;
    mapRef.current?.setStyle(outdoorStyle(variant));
  }, [variant, indoor]);

  useEffect(() => {
    const sim = window.setInterval(() => {
      if (pausedRef.current) return;
      let moved = false;
      let changed = false;
      const now = Date.now();
      const evacStart = evacStartRef.current;
      for (let i = 0; i < AGENT_COUNT; i += 1) {
        if (statusesRef.current[i] === STATUS_CODE.danger) continue;
        const cur: LngLat = [positionsRef.current[i * 2], positionsRef.current[i * 2 + 1]];
        if (evacRef.current && statusesRef.current[i] === STATUS_CODE.normal && evacStart !== null && now - evacStart >= delayRef.current[i]) {
          statusesRef.current[i] = STATUS_CODE.evacuating;
          speedsRef.current[i] = rand(1.8, 2.5);
          exitsRef.current[i] = nearestExit(cur);
          pathsRef.current[i] = [EXIT_POINTS[exitsRef.current[i]].coordinate];
          etaRef.current[i] = distM(cur, EXIT_POINTS[exitsRef.current[i]].coordinate) / Math.max(speedsRef.current[i], 0.1);
          changed = true;
        }
        if (statusesRef.current[i] === STATUS_CODE.safe) continue;
        if (pathsRef.current[i].length === 0) {
          if (statusesRef.current[i] === STATUS_CODE.normal) pathsRef.current[i] = normalPath(sectorsRef.current[i]);
          if (statusesRef.current[i] === STATUS_CODE.evacuating && exitsRef.current[i] >= 0) pathsRef.current[i] = [EXIT_POINTS[exitsRef.current[i]].coordinate];
        }
        if (pathsRef.current[i].length === 0) continue;
        const target = pathsRef.current[i][0];
        const d = distM(cur, target);
        const step = speedsRef.current[i] * (STEP_MS / 1000);
        const next = d <= step ? target : clamp([cur[0] + ((target[0] - cur[0]) * step) / d, cur[1] + ((target[1] - cur[1]) * step) / d]);
        positionsRef.current[i * 2] = next[0];
        positionsRef.current[i * 2 + 1] = next[1];
        moved = true;
        if (d <= step || distM(next, target) < 1.2) pathsRef.current[i].shift();
        if (statusesRef.current[i] === STATUS_CODE.evacuating && exitsRef.current[i] >= 0) {
          const exit = EXIT_POINTS[exitsRef.current[i]].coordinate;
          const left = distM(next, exit);
          etaRef.current[i] = left / Math.max(speedsRef.current[i], 0.1);
          const westBoundaryExit = next[0] <= SIM_BOUNDS.west + 0.00002 && exit[0] < SIM_BOUNDS.west;
          if (left < 5 || westBoundaryExit) {
            statusesRef.current[i] = STATUS_CODE.safe;
            pathsRef.current[i] = [];
            speedsRef.current[i] = 0;
            etaRef.current[i] = -1;
            changed = true;
          }
        }
      }
      if (moved) posVerRef.current += 1;
      if (changed) statusVerRef.current += 1;
      refreshDeck();
    }, STEP_MS);

    const heat = window.setInterval(() => setHeatmapRev((x) => x + 1), HEATMAP_MS);
    const uiTimer = window.setInterval(() => {
      let evac = 0;
      let safe = 0;
      let danger = 0;
      const sectorCounts = new Map<string, number>();
      for (let i = 0; i < AGENT_COUNT; i += 1) {
        if (statusesRef.current[i] === STATUS_CODE.evacuating) evac += 1;
        if (statusesRef.current[i] === STATUS_CODE.safe) safe += 1;
        if (statusesRef.current[i] === STATUS_CODE.danger) danger += 1;
        sectorCounts.set(sectorsRef.current[i], (sectorCounts.get(sectorsRef.current[i]) ?? 0) + 1);
      }
      let hotspot = "North Spine";
      let c = -1;
      for (const [s, n] of sectorCounts.entries()) if (n > c) { c = n; hotspot = s; }
      setUi({
        evacuating: evac,
        safe,
        danger,
        avgDensity: Number((AGENT_COUNT / areaPer100).toFixed(2)),
        hotspotSector: hotspot,
        simElapsedSec: Math.floor((Date.now() - simStartRef.current) / 1000),
        evacuationElapsedSec: evacRef.current && evacStartRef.current !== null ? Math.floor((Date.now() - evacStartRef.current) / 1000) : 0
      });
      if (selectedIndexRef.current !== null) setSelectedAgent(snapshot(selectedIndexRef.current));
    }, UI_MS);
    return () => { window.clearInterval(sim); window.clearInterval(heat); window.clearInterval(uiTimer); };
  }, [areaPer100]);

  const sideTop = evacuation ? "top-28" : "top-16";
  const panelTop = evacuation ? "top-28" : "top-16";

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
            <div className="hidden items-center gap-3 text-xs text-slate-600 dark:text-slate-300 sm:flex md:gap-4 lg:text-sm">
              <span className="flex items-center gap-1"><Users className="h-4 w-4 text-cyan-500 dark:text-cyan-300" />Total <span className="font-mono-display text-slate-900 dark:text-slate-100">{AGENT_COUNT.toLocaleString()}</span></span>
              <span className="flex items-center gap-1"><Route className="h-4 w-4 text-amber-300" />Evacuating <span className="font-mono-display text-amber-200">{ui.evacuating}</span></span>
              <span className="flex items-center gap-1"><Check className="h-4 w-4 text-emerald-300" />Safe <span className="font-mono-display text-emerald-200">{ui.safe}</span></span>
              <span className="flex items-center gap-1"><AlertTriangle className="h-4 w-4 text-rose-300" />Danger <span className="font-mono-display text-rose-200">{ui.danger}</span></span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSidebarCollapsed((x) => !x)} className="ui-button flex items-center border border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:hidden">
              {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
            <div className="hidden items-center rounded-md border border-slate-300 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800 sm:flex">
              <button type="button" onClick={() => setVariant("2d")} className={`ui-button flex items-center gap-1 border ${variant === "2d" ? "border-cyan-500 bg-cyan-600 text-slate-950" : "border-transparent bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-100"}`}><MapIcon className="h-4 w-4" /><span className="text-xs">2D</span></button>
              <button type="button" onClick={() => setVariant("3d")} className={`ui-button flex items-center gap-1 border ${variant === "3d" ? "border-cyan-500 bg-cyan-600 text-slate-950" : "border-transparent bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-100"}`}><Building2 className="h-4 w-4" /><span className="text-xs">3D</span></button>
            </div>
            <button type="button" onClick={() => setDarkMode((x) => !x)} className="ui-button flex items-center gap-1 border border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span className="hidden text-xs sm:inline">{darkMode ? "Light" : "Dark"}</span>
            </button>
            <Link to="/dashboard" className="ui-button flex items-center gap-1 border border-slate-300 bg-white text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"><Layers className="h-4 w-4" />Dashboard</Link>
          </div>
        </header>

        {evacuation && (
          <div className="fixed left-0 right-0 top-0 z-30 m-3 mt-16 animate-pulse rounded-lg border border-rose-500/60 bg-rose-600 px-4 py-2 text-sm text-white">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /><span className="font-mono-display">EVACUATION IN PROGRESS</span></span>
              <span className="font-mono-display">Elapsed: {hms(ui.evacuationElapsedSec)}</span>
            </div>
          </div>
        )}

        <aside className={`ui-card fixed ${sideTop} left-3 z-30 w-[min(18rem,calc(100vw-1.5rem))] border-slate-300 bg-slate-100/95 p-4 text-slate-900 transition-transform dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 sm:w-72 sm:translate-x-0 ${sidebarCollapsed ? "-translate-x-[calc(100%+1rem)]" : "translate-x-0"}`}>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => setPlayback("play")} className="ui-button flex items-center justify-center gap-1 border border-slate-700 bg-cyan-700 text-white"><Play className="h-4 w-4" /><span className="text-xs">Play</span></button>
              <button type="button" onClick={() => setPlayback("pause")} className="ui-button flex items-center justify-center gap-1 border border-slate-700 bg-amber-500 text-slate-950"><Pause className="h-4 w-4" /><span className="text-xs">Pause</span></button>
              <button type="button" onClick={resetAll} className="ui-button flex items-center justify-center gap-1 border border-slate-700 bg-slate-700 text-slate-100"><RotateCcw className="h-4 w-4" /><span className="text-xs">Reset</span></button>
            </div>
            <button type="button" onClick={evacuation ? cancelEvacuation : triggerEvacuation} className={`ui-button flex w-full items-center justify-center gap-2 border ${evacuation ? "border-amber-400 bg-amber-500 text-slate-950" : "border-rose-400 bg-rose-600 text-white"}`}>
              {evacuation ? <X className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              <span>{evacuation ? "Cancel Evacuation" : "Trigger Evacuation"}</span>
            </button>

            <div className="border-t border-slate-700 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Layers</p>
              <div className="mt-2 space-y-2">
                {[
                  ["showAgents", "Agent Dots"],
                  ["showHeatmap", "Density Heatmap"],
                  ["showWalkways", "Walkways"],
                  ["show3dBuildings", "3D Buildings"]
                ].map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setLayerSettings((s) => ({ ...s, [key]: !s[key as keyof LayerSettings] }))} className="ui-button flex w-full items-center justify-between border border-slate-300 bg-white text-left text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                    <span className="flex items-center gap-2">
                      <span className={`flex h-5 w-5 items-center justify-center rounded border ${(layerSettings[key as keyof LayerSettings] as boolean) ? "border-cyan-400 bg-cyan-500/20 text-cyan-300" : "border-slate-600 bg-slate-900 text-slate-500"}`}><Check className="h-3 w-3" /></span>
                      <span>{label}</span>
                    </span>
                    <span className="font-mono-display text-xs text-slate-400">{(layerSettings[key as keyof LayerSettings] as boolean) ? "ON" : "OFF"}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-700 pt-3">
              <label htmlFor="lookup" className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Locate Agent ID</label>
              <div className="flex items-center gap-2">
                <input id="lookup" value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="AGT-0123" className="ui-input font-mono-display text-sm" />
                <button type="button" onClick={locateAgent} className="ui-button flex items-center gap-1 border border-slate-700 bg-cyan-700 text-white"><Search className="h-4 w-4" /><span className="text-xs">Find</span></button>
              </div>
              {lookupErr && <p className="mt-1 text-xs text-rose-300">{lookupErr}</p>}
            </div>

            <div className="border-t border-slate-700 pt-3 text-xs text-slate-300">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Stats</p>
              <p className="flex justify-between gap-2"><span>Avg density</span><span className="font-mono-display text-slate-100">{ui.avgDensity} agents/100m²</span></p>
              <p className="flex justify-between gap-2"><span>Hotspot sector</span><span className="font-mono-display text-cyan-300">{ui.hotspotSector}</span></p>
              <p className="flex justify-between gap-2"><span>Time elapsed</span><span className="font-mono-display text-slate-100">{hms(ui.simElapsedSec)}</span></p>
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
              <div className={`mb-3 inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs ${STATUS_META[selectedAgent.status].badge}`}>{(() => { const Icon = statusIcon(selectedAgent.status); return <Icon className="h-4 w-4" />; })()}<span>{STATUS_META[selectedAgent.status].label}</span></div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-slate-400">Sector</dt><dd className="font-mono-display">{selectedAgent.sector}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-400">Coordinates</dt><dd className="font-mono-display">{selectedAgent.position[1].toFixed(6)}, {selectedAgent.position[0].toFixed(6)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-400">Speed</dt><dd className="font-mono-display">{selectedAgent.speed.toFixed(2)} m/s</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-400">Waypoints</dt><dd className="font-mono-display">{selectedAgent.path.length}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-400">ETA</dt><dd className="font-mono-display">{selectedAgent.eta === null ? "N/A" : mmss(selectedAgent.eta)}</dd></div>
              </dl>
            </>
          )}
        </aside>

        {indoor && <button type="button" onClick={backToCampus} className="ui-button fixed left-3 top-16 z-40 flex items-center gap-2 border border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"><ChevronLeft className="h-4 w-4" />Back to Campus</button>}

        <footer className="fixed bottom-0 left-0 right-0 z-30 m-3 flex h-10 items-center justify-between rounded-lg border border-slate-300 bg-slate-100/95 px-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200 sm:px-4 md:px-6 lg:px-8 xl:px-10">
          <span className="flex items-center gap-1"><Users className="h-4 w-4 text-cyan-300" />Total <span className="font-mono-display">{AGENT_COUNT.toLocaleString()}</span></span>
          <span className="flex items-center gap-1"><Route className="h-4 w-4 text-amber-300" />Evacuating <span className="font-mono-display">{ui.evacuating}</span></span>
          <span className="flex items-center gap-1"><Check className="h-4 w-4 text-emerald-300" />Safe <span className="font-mono-display">{ui.safe}</span></span>
          <span className="flex items-center gap-1"><AlertTriangle className="h-4 w-4 text-rose-300" />Danger <span className="font-mono-display">{ui.danger}</span></span>
          <span className="hidden items-center gap-1 sm:flex"><Clock3 className="h-4 w-4 text-cyan-300" /><span className="font-mono-display">{hms(ui.simElapsedSec)}</span></span>
          <span className="hidden items-center gap-1 md:flex"><Building2 className="h-4 w-4 text-slate-300" />{indoor ? "Indoor 2D" : "Outdoor 3D"}</span>
        </footer>
      </section>
    </div>
  );
}
