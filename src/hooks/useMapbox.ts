import mapboxgl from "mapbox-gl";
import { useEffect, useRef, type RefObject } from "react";
import { CAMERA_DEFAULT_PITCH, CAMERA_DEFAULT_ZOOM, NTU_CENTER, OUTDOOR_STREETS_STYLE, getMapboxToken } from "../lib/mapConfig";

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
      center: NTU_CENTER,
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
