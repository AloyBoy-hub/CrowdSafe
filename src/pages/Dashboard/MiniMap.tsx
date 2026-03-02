import mapboxgl from "mapbox-gl";
import { useEffect, useMemo, useRef } from "react";
import { OUTDOOR_STREETS_STYLE, getMapboxToken } from "../../lib/mapConfig";
import type { Agent, Exit, Hazard } from "../../lib/types";

type LngLat = [number, number];

interface MiniMapProps {
  agents: Agent[];
  exits: Exit[];
  hazards: Hazard[];
}

const STADIUM_CENTER: LngLat = [103.8742, 1.3044];

function hazardPolygon(lat: number, lng: number, radiusM: number): LngLat[] {
  const points: LngLat[] = [];
  const steps = 40;
  for (let i = 0; i <= steps; i += 1) {
    const theta = (i / steps) * Math.PI * 2;
    const latOffset = (radiusM / 110540) * Math.sin(theta);
    const lngOffset = (radiusM / (111320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)))) * Math.cos(theta);
    points.push([lng + lngOffset, lat + latOffset]);
  }
  return points;
}

export default function MiniMap({ agents, exits, hazards }: MiniMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const agentsGeo = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(
    () => ({
      type: "FeatureCollection",
      features: agents.map((agent) => ({
        type: "Feature",
        properties: { status: agent.status },
        geometry: {
          type: "Point",
          coordinates: [agent.lng, agent.lat]
        }
      }))
    }),
    [agents]
  );

  const exitsGeo = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(
    () => ({
      type: "FeatureCollection",
      features: exits.map((exit) => ({
        type: "Feature",
        properties: { id: exit.id, status: exit.status },
        geometry: { type: "Point", coordinates: [exit.lng, exit.lat] }
      }))
    }),
    [exits]
  );

  const hazardsGeo = useMemo<GeoJSON.FeatureCollection<GeoJSON.Polygon>>(
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

  useEffect(() => {
    if (!containerRef.current) return;
    mapboxgl.accessToken = getMapboxToken();
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: OUTDOOR_STREETS_STYLE,
      center: STADIUM_CENTER,
      zoom: 15,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
      interactive: false
    });
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("agents-mini", { type: "geojson", data: agentsGeo });
      map.addSource("hazards-mini", { type: "geojson", data: hazardsGeo });
      map.addSource("exits-mini", { type: "geojson", data: exitsGeo });

      map.addLayer({
        id: "hazards-mini-fill",
        type: "fill",
        source: "hazards-mini",
        paint: { "fill-color": "#EF4444", "fill-opacity": 0.15 }
      });
      map.addLayer({
        id: "hazards-mini-outline",
        type: "line",
        source: "hazards-mini",
        paint: { "line-color": "#EF4444", "line-width": 2 }
      });
      map.addLayer({
        id: "agents-mini-layer",
        type: "circle",
        source: "agents-mini",
        paint: {
          "circle-radius": 2,
          "circle-color": [
            "match",
            ["get", "status"],
            "safe",
            "#10B981",
            "evacuating",
            "#F59E0B",
            "danger",
            "#EF4444",
            "#000000"
          ],
          "circle-opacity": 0.8
        }
      });
      map.addLayer({
        id: "exits-mini-layer",
        type: "circle",
        source: "exits-mini",
        paint: {
          "circle-radius": 5,
          "circle-color": "#3B82F6",
          "circle-stroke-color": "#0A0E1A",
          "circle-stroke-width": 2
        }
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    (map.getSource("agents-mini") as mapboxgl.GeoJSONSource | undefined)?.setData(agentsGeo as never);
    (map.getSource("hazards-mini") as mapboxgl.GeoJSONSource | undefined)?.setData(hazardsGeo as never);
    (map.getSource("exits-mini") as mapboxgl.GeoJSONSource | undefined)?.setData(exitsGeo as never);
  }, [agentsGeo, hazardsGeo, exitsGeo]);

  return (
    <article className="ui-card border-[#1E2D4A] bg-[#0F1629] p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">National Stadium - Live</p>
      <div className="relative mt-3 h-[420px] overflow-hidden rounded-lg border border-[#1E2D4A]">
        <div ref={containerRef} className="absolute inset-0" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_55%,#0A0E1A_100%)]" />
      </div>
    </article>
  );
}
