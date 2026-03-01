import mapboxgl from "mapbox-gl";
import { useEffect, useRef, type RefObject } from "react";
import { MAP_DEFAULT_PITCH, MAP_DEFAULT_ZOOM, NTU_CENTER, resolveMapStyle } from "../lib/mapConfig";

export function useMapbox(containerRef: RefObject<HTMLDivElement | null>) {
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN ?? "";

    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: resolveMapStyle(),
      center: [NTU_CENTER.lng, NTU_CENTER.lat],
      zoom: MAP_DEFAULT_ZOOM,
      pitch: MAP_DEFAULT_PITCH,
      antialias: true
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [containerRef]);

  return mapRef;
}

