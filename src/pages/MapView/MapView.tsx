import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import { LineLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import { MapboxOverlay } from "@deck.gl/mapbox";
import {
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Layers,
  Map as MapIcon,
  Moon,
  Play,
  Shield,
  Sun,
  TriangleAlert,
  Users,
  X
} from "lucide-react";
import mapboxgl, { type GeoJSONSource, type MapLayerMouseEvent, type MapMouseEvent, type Marker } from "mapbox-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import indoorNorthSpineRaw from "../../data/indoor-north-spine.geojson?raw";
import { CAMPUS_WALKWAYS } from "../../data/campusWalkways";
import { apiClient } from "../../lib/api";
import {
  CAMERA_DEFAULT_BEARING,
  CAMERA_DEFAULT_PITCH,
  CAMERA_DEFAULT_ZOOM,
  CAMERA_MAX_ZOOM,
  CAMERA_MIN_ZOOM,
  EXIT_POINTS,
  INDOOR_LIGHT_STYLE,
  NTU_CENTER,
  OUTDOOR_STANDARD_STYLE,
  OUTDOOR_STREETS_STYLE,
  getMapboxToken
} from "../../lib/mapConfig";
import { useSimStore } from "../../store/useSimStore";

type LngLat = [number, number];
type MapVariant = "2d" | "3d";

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

interface SelectedAgent {
  id: string;
  lat: number;
  lng: number;
  status: string;
  sector: number;
  eta: number | null;
}

const indoorNorthSpine = JSON.parse(indoorNorthSpineRaw) as { features: IndoorFeature[] };

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

function outdoorStyle(v: MapVariant): string {
  return v === "3d" ? OUTDOOR_STANDARD_STYLE : OUTDOOR_STREETS_STYLE;
}

function hazardPolygon(lat: number, lng: number, radiusM: number): [number, number][] {
  const points: [number, number][] = [];
  const steps = 48;

  for (let i = 0; i <= steps; i += 1) {
    const theta = (i / steps) * Math.PI * 2;
    const latOffset = (radiusM / 111_320) * Math.sin(theta);
    const lngOffset = (radiusM / (111_320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)))) * Math.cos(theta);
    points.push([lng + lngOffset, lat + latOffset]);
  }

  return points;
}

export default function MapView() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const deckRef = useRef<MapboxOverlay | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const selectedAgentIndexRef = useRef<number | null>(null);

  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("campuswatch-dark-mode") !== "light");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("campuswatch-sidebar-collapsed") === "true");
  const [variant, setVariant] = useState<MapVariant>("2d");
  const [indoor, setIndoor] = useState(false);
  const [layerSettings, setLayerSettings] = useState<LayerSettings>({
    showAgents: true,
    showHeatmap: true,
    showWalkways: true,
    show3dBuildings: true
  });
  const [selectedAgent, setSelectedAgent] = useState<SelectedAgent | null>(null);

  const [placeMode, setPlaceMode] = useState(false);
  const [hazardRadius, setHazardRadius] = useState(60);
  const [busy, setBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState("Ready");

  const agents = useSimStore((state) => state.agents);
  const exits = useSimStore((state) => state.exits);
  const hazards = useSimStore((state) => state.hazards);
  const heatmapCells = useSimStore((state) => state.heatmapCells);
  const frame = useSimStore((state) => state.frame);

  const hazardGeoJson = useMemo<GeoJSON.FeatureCollection<GeoJSON.Polygon>>(
    () => ({
      type: "FeatureCollection",
      features: hazards.map((hazard) => ({
        type: "Feature",
        properties: { id: hazard.id, type: hazard.type },
        geometry: {
          type: "Polygon",
          coordinates: [hazardPolygon(hazard.lat, hazard.lng, hazard.radius_m)]
        }
      }))
    }),
    [hazards]
  );

  const exitGeoJson = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(
    () => ({
      type: "FeatureCollection",
      features: exits.map((exitData) => ({
        type: "Feature",
        properties: {
          id: exitData.id,
          status: exitData.status,
          queue: exitData.queue,
          override: exitData.override ? "manual" : "auto"
        },
        geometry: { type: "Point", coordinates: [exitData.lng, exitData.lat] }
      }))
    }),
    [exits]
  );

  const agentPositions = useMemo(() => agents.map((agent) => [agent.lng, agent.lat] as [number, number]), [agents]);

  const clearMarkers = () => {
    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];
  };

  const addExitMarkers = (map: mapboxgl.Map) => {
    clearMarkers();
    for (const exit of EXIT_POINTS) {
      const el = document.createElement("div");
      el.className = "h-3 w-3 rounded-full bg-rose-500 shadow-[0_0_0_4px_rgba(244,63,94,0.25)]";
      el.title = exit.label;
      markersRef.current.push(new mapboxgl.Marker({ element: el }).setLngLat(exit.coordinate).addTo(map));
    }
  };

  const refreshDeck = () => {
    const overlay = deckRef.current;
    if (!overlay) return;

    const layers: unknown[] = [];

    if (layerSettings.showHeatmap) {
      layers.push(
        new HeatmapLayer<{ position: LngLat; weight: number }>({
          id: "heatmap",
          data: heatmapCells.map((cell) => ({ position: [cell.lng, cell.lat], weight: Math.max(0.01, cell.density) })),
          radiusPixels: 36,
          intensity: 1,
          threshold: 0.03,
          colorRange: [
            [0, 0, 0, 0],
            [59, 130, 246, 190],
            [234, 179, 8, 220],
            [239, 68, 68, 240]
          ],
          getPosition: (d) => d.position,
          getWeight: (d) => d.weight
        })
      );
    }

    if (layerSettings.showAgents) {
      layers.push(
        new ScatterplotLayer<number>({
          id: "agents",
          data: Array.from({ length: agents.length }, (_, i) => i),
          pickable: true,
          radiusMinPixels: 2,
          radiusMaxPixels: 5,
          getRadius: () => 3,
          getPosition: (i: number) => agentPositions[i],
          getFillColor: (i: number) => {
            const status = agents[i]?.status;
            if (status === "danger") return [239, 68, 68, 240];
            if (status === "evacuating") return [251, 191, 36, 230];
            if (status === "safe") return [34, 197, 94, 230];
            return [15, 23, 42, 220];
          },
          onClick: (info: PickingInfo<number>) => {
            if (typeof info.index !== "number" || info.index < 0) return;
            const agent = agents[info.index];
            if (!agent) return;
            selectedAgentIndexRef.current = info.index;
            setSelectedAgent({
              id: agent.id,
              lat: agent.lat,
              lng: agent.lng,
              status: agent.status,
              sector: agent.sector,
              eta: agent.path_eta_s
            });
          }
        })
      );
    }

    if (selectedAgentIndexRef.current !== null) {
      const i = selectedAgentIndexRef.current;
      const selected = agents[i];
      if (selected && selected.exit_target) {
        const target = exits.find((exitData) => exitData.id === selected.exit_target);
        if (target) {
          layers.push(
            new LineLayer<{ source: LngLat; target: LngLat }>({
              id: "selected-route",
              data: [{ source: [selected.lng, selected.lat], target: [target.lng, target.lat] }],
              getSourcePosition: (d) => d.source,
              getTargetPosition: (d) => d.target,
              getColor: () => [34, 211, 238, 210],
              getWidth: () => 2,
              widthUnits: "pixels"
            })
          );
        }
      }
    }

    overlay.setProps({ layers: layers as never[] });
  };

  const refreshMapLayers = () => {
    const map = mapRef.current;
    if (!map) return;

    const walkVis = layerSettings.showWalkways && !indoor ? "visible" : "none";
    const bldVis = layerSettings.show3dBuildings && !indoor ? "visible" : "none";

    if (map.getLayer("walkways-layer")) map.setLayoutProperty("walkways-layer", "visibility", walkVis);
    if (map.getLayer("buildings-extrusion")) map.setLayoutProperty("buildings-extrusion", "visibility", bldVis);

    const hazardSource = map.getSource("hazard-source") as GeoJSONSource | undefined;
    hazardSource?.setData(hazardGeoJson);

    const exitSource = map.getSource("exit-source") as GeoJSONSource | undefined;
    exitSource?.setData(exitGeoJson);
  };

  useEffect(() => {
    localStorage.setItem("campuswatch-dark-mode", darkMode ? "dark" : "light");
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem("campuswatch-sidebar-collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    mapboxgl.accessToken = getMapboxToken();

    const map = new mapboxgl.Map({
      container: mapContainerRef.current as HTMLElement,
      style: outdoorStyle(variant),
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

    const setupOutdoor = () => {
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
        const before = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
        map.addLayer(
          {
            id: "buildings-extrusion",
            type: "fill-extrusion",
            source: "composite",
            "source-layer": "building",
            filter: ["==", ["get", "extrude"], "true"],
            minzoom: 15,
            paint: {
              "fill-extrusion-color": "#7dd3fc",
              "fill-extrusion-height": ["coalesce", ["get", "height"], 8],
              "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
              "fill-extrusion-opacity": 0.45
            }
          },
          before
        );
      }

      if (!map.getSource("hazard-source")) {
        map.addSource("hazard-source", { type: "geojson", data: hazardGeoJson });
        map.addLayer({ id: "hazard-fill", type: "fill", source: "hazard-source", paint: { "fill-color": "#ef4444", "fill-opacity": 0.2 } });
        map.addLayer({ id: "hazard-line", type: "line", source: "hazard-source", paint: { "line-color": "#b91c1c", "line-width": 2 } });
      }

      if (!map.getSource("exit-source")) {
        map.addSource("exit-source", { type: "geojson", data: exitGeoJson });
        map.addLayer({
          id: "exit-points",
          type: "circle",
          source: "exit-source",
          paint: {
            "circle-radius": 7,
            "circle-stroke-width": 2,
            "circle-stroke-color": ["match", ["get", "override"], "manual", "#f59e0b", "#0f172a"],
            "circle-color": [
              "match",
              ["get", "status"],
              "open",
              "#22c55e",
              "congested",
              "#f59e0b",
              "blocked",
              "#ef4444",
              "#64748b"
            ]
          }
        });
      }

      addExitMarkers(map);
      refreshMapLayers();
      refreshDeck();
    };

    const setupIndoor = () => {
      if (!map.getSource("indoor-src")) map.addSource("indoor-src", { type: "geojson", data: indoorNorthSpine as never });
      if (!map.getLayer("indoor-fill")) {
        map.addLayer({
          id: "indoor-fill",
          type: "fill",
          source: "indoor-src",
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: { "fill-opacity": 0.75, "fill-color": "#1e293b" }
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
      clearMarkers();
      refreshDeck();
    };

    map.on("style.load", () => {
      if (indoor) setupIndoor();
      else setupOutdoor();
    });

    map.on("click", (event: MapLayerMouseEvent) => {
      if (indoor || placeMode) return;
      const match = map
        .queryRenderedFeatures(event.point, { layers: ["building"] })
        .find((f) => BUILDING_NAMES.has(String(f.properties?.name ?? f.properties?.name_en ?? "").trim()));
      if (!match) return;
      setIndoor(true);
      map.flyTo({ center: [event.lngLat.lng, event.lngLat.lat], zoom: 19, pitch: 0, bearing: 0, duration: 900 });
      map.setStyle(INDOOR_LIGHT_STYLE);
    });

    return () => {
      clearMarkers();
      overlay.finalize();
      map.remove();
    };
  }, []);

  useEffect(() => {
    refreshMapLayers();
    refreshDeck();
    if (selectedAgentIndexRef.current !== null) {
      const selected = agents[selectedAgentIndexRef.current];
      if (selected) {
        setSelectedAgent({
          id: selected.id,
          lat: selected.lat,
          lng: selected.lng,
          status: selected.status,
          sector: selected.sector,
          eta: selected.path_eta_s
        });
      }
    }
  }, [agents, exits, hazardGeoJson, exitGeoJson, heatmapCells, layerSettings, indoor]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || indoor) return;
    map.setStyle(outdoorStyle(variant));
  }, [variant, indoor]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.getCanvas().style.cursor = placeMode ? "crosshair" : "";

    const onClick = async (event: MapMouseEvent) => {
      if (!placeMode || busy) return;
      setBusy(true);
      try {
        await apiClient.placeHazard({ lat: event.lngLat.lat, lng: event.lngLat.lng, radius_m: hazardRadius, type: "fire" });
        setActionMessage(`Hazard placed (${hazardRadius}m). A* reroute triggered.`);
      } catch (error) {
        console.error(error);
        setActionMessage("Failed to place hazard");
      } finally {
        setBusy(false);
      }
    };

    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
      map.getCanvas().style.cursor = "";
    };
  }, [placeMode, busy, hazardRadius]);

  const backToCampus = () => {
    const map = mapRef.current;
    if (!map) return;
    setIndoor(false);
    map.setStyle(outdoorStyle(variant));
    map.once("style.load", () => {
      map.flyTo({ center: NTU_CENTER, zoom: CAMERA_DEFAULT_ZOOM, pitch: CAMERA_DEFAULT_PITCH, bearing: CAMERA_DEFAULT_BEARING, duration: 900 });
    });
  };

  const startEvacuation = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await apiClient.startEvacuation();
      setActionMessage(`Evacuation started. A* rerouted ${response.affected_agents} agents.`);
    } catch (error) {
      console.error(error);
      setActionMessage("Failed to start evacuation");
    } finally {
      setBusy(false);
    }
  };

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
            <div className="hidden items-center gap-3 text-xs text-slate-600 dark:text-slate-300 sm:flex md:gap-4 lg:text-sm">
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4 text-cyan-500 dark:text-cyan-300" />
                Total <span className="font-mono-display text-slate-900 dark:text-slate-100">{agents.length.toLocaleString()}</span>
              </span>
              <span className="font-mono-display text-xs">Frame {frame}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSidebarCollapsed((x) => !x)}
              className="ui-button flex items-center border border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:hidden"
            >
              {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
            <div className="hidden items-center rounded-md border border-slate-300 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800 sm:flex">
              <button
                type="button"
                onClick={() => setVariant("2d")}
                className={`ui-button flex items-center gap-1 border ${variant === "2d" ? "border-cyan-500 bg-cyan-600 text-slate-950" : "border-transparent bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-100"}`}
              >
                <MapIcon className="h-4 w-4" />
                <span className="text-xs">2D</span>
              </button>
              <button
                type="button"
                onClick={() => setVariant("3d")}
                className={`ui-button flex items-center gap-1 border ${variant === "3d" ? "border-cyan-500 bg-cyan-600 text-slate-950" : "border-transparent bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-100"}`}
              >
                <Building2 className="h-4 w-4" />
                <span className="text-xs">3D</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setDarkMode((x) => !x)}
              className="ui-button flex items-center gap-1 border border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span className="hidden text-xs sm:inline">{darkMode ? "Light" : "Dark"}</span>
            </button>
            <Link
              to="/dashboard"
              className="ui-button flex items-center gap-1 border border-slate-300 bg-white text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <Layers className="h-4 w-4" />Dashboard
            </Link>
          </div>
        </header>

        <aside
          className={`ui-card fixed ${sideTop} left-3 z-30 w-[min(20rem,calc(100vw-1.5rem))] border-slate-300 bg-slate-100/95 p-4 text-slate-900 transition-transform dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 sm:w-80 sm:translate-x-0 ${sidebarCollapsed ? "-translate-x-[calc(100%+1rem)]" : "translate-x-0"}`}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Layers</p>
          <div className="mt-2 space-y-2">
            {([
              ["showAgents", "Agent Dots"],
              ["showHeatmap", "Density Heatmap"],
              ["showWalkways", "Walkways"],
              ["show3dBuildings", "3D Buildings"]
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setLayerSettings((s) => ({ ...s, [key]: !s[key] }))}
                className="ui-button flex w-full items-center justify-between border border-slate-300 bg-white text-left text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <span className="flex items-center gap-2">
                  <span className={`flex h-5 w-5 items-center justify-center rounded border ${layerSettings[key] ? "border-cyan-400 bg-cyan-500/20 text-cyan-300" : "border-slate-600 bg-slate-900 text-slate-500"}`}>
                    <Check className="h-3 w-3" />
                  </span>
                  <span>{label}</span>
                </span>
                <span className="font-mono-display text-xs text-slate-400">{layerSettings[key] ? "ON" : "OFF"}</span>
              </button>
            ))}
          </div>

          <div className="mt-4 border-t border-slate-300 pt-3 dark:border-slate-700">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Module 4/5 Controls</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPlaceMode((v) => !v)}
                className={`ui-button flex items-center gap-1 border px-2 py-1 text-xs ${placeMode ? "border-rose-600 bg-rose-600 text-white" : "border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800"}`}
              >
                <TriangleAlert className="h-3.5 w-3.5" /> {placeMode ? "Hazard Mode ON" : "Place Hazard"}
              </button>
              <button
                type="button"
                onClick={startEvacuation}
                className="ui-button flex items-center gap-1 border border-amber-500 bg-amber-500 px-2 py-1 text-xs text-slate-900"
              >
                <Play className="h-3.5 w-3.5" /> Start Evacuation
              </button>
            </div>
            <label className="mt-2 block text-xs">Hazard Radius: {hazardRadius}m</label>
            <input
              className="mt-1 w-full accent-rose-600"
              type="range"
              min={20}
              max={160}
              step={5}
              value={hazardRadius}
              onChange={(event) => setHazardRadius(Number(event.target.value))}
            />
            <p className="mt-2 rounded bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">{actionMessage}</p>
          </div>
        </aside>

        <aside
          className={`ui-card fixed ${panelTop} right-3 z-30 w-[min(20rem,calc(100vw-1.5rem))] border-slate-300 bg-slate-100/95 p-4 text-slate-900 transition-transform dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 ${selectedAgent ? "translate-x-0" : "translate-x-[calc(100%+1rem)]"}`}
        >
          {selectedAgent && (
            <>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Agent</p>
                  <h2 className="font-mono-display text-2xl text-cyan-300">{selectedAgent.id}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    selectedAgentIndexRef.current = null;
                    setSelectedAgent(null);
                  }}
                  className="ui-button flex items-center gap-1 border border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <X className="h-4 w-4" />
                  <span className="text-xs">Close</span>
                </button>
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-slate-400">Status</dt><dd className="font-mono-display">{selectedAgent.status}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-400">Sector</dt><dd className="font-mono-display">{selectedAgent.sector}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-400">Coordinates</dt><dd className="font-mono-display">{selectedAgent.lat.toFixed(6)}, {selectedAgent.lng.toFixed(6)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-400">ETA</dt><dd className="font-mono-display">{selectedAgent.eta ?? "--"}s</dd></div>
              </dl>
            </>
          )}
        </aside>

        {indoor && (
          <button
            type="button"
            onClick={backToCampus}
            className="ui-button fixed left-3 top-16 z-40 flex items-center gap-2 border border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <ChevronLeft className="h-4 w-4" />Back to Campus
          </button>
        )}
      </section>
    </div>
  );
}
