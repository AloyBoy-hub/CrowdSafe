import mapboxgl from "mapbox-gl";
import { useEffect, useRef, type RefObject } from "react";
import { CAMERA_DEFAULT_PITCH, CAMERA_DEFAULT_ZOOM, OUTDOOR_STREETS_STYLE, VENUE_CENTER, getMapboxToken } from "../lib/mapConfig";

export function useMapbox(containerRef: RefObject<HTMLDivElement | null>) {
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    mapboxgl.accessToken = getMapboxToken();

    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: OUTDOOR_STREETS_STYLE,
      center: VENUE_CENTER,
      zoom: CAMERA_DEFAULT_ZOOM,
      pitch: CAMERA_DEFAULT_PITCH,
      antialias: true
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [containerRef]);

  return mapRef;
}
