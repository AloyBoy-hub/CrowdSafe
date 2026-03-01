import type { StyleSpecification } from "mapbox-gl";

export const NTU_CENTER = {
  lat: 1.3483,
  lng: 103.6831
} as const;

export const MAP_DEFAULT_ZOOM = 15;
export const MAP_DEFAULT_PITCH = 45;

export const MAPBOX_STYLE_URL =
  import.meta.env.VITE_MAPBOX_STYLE_URL ?? "mapbox://styles/mapbox/streets-v12";

const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "OpenStreetMap contributors"
    }
  },
  layers: [
    {
      id: "osm-tiles",
      type: "raster",
      source: "osm"
    }
  ]
};

export function resolveMapStyle(): string | StyleSpecification {
  const token = import.meta.env.VITE_MAPBOX_TOKEN;

  if (token && MAPBOX_STYLE_URL.startsWith("mapbox://")) {
    return MAPBOX_STYLE_URL;
  }

  return FALLBACK_STYLE;
}

