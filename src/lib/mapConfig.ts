export const MAPBOX_ACCESS_TOKEN = "REPLACE_WITH_YOUR_MAPBOX_PUBLIC_TOKEN";
// Replace MAPBOX_ACCESS_TOKEN with your personal Mapbox public token (pk.*).

export function getMapboxToken(): string {
  const envToken = import.meta.env.VITE_MAPBOX_TOKEN?.trim();
  return envToken || MAPBOX_ACCESS_TOKEN;
}

export const OUTDOOR_STREETS_STYLE = "mapbox://styles/mapbox/outdoors-v12";
export const OUTDOOR_SATELLITE_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";
export const OUTDOOR_STANDARD_STYLE = "mapbox://styles/mapbox/standard";
export const INDOOR_LIGHT_STYLE = "mapbox://styles/mapbox/light-v11";

export const NTU_BOUNDS_SW: [number, number] = [103.678, 1.327];
export const NTU_BOUNDS_NE: [number, number] = [103.686, 1.343];
export const NTU_CENTER: [number, number] = [103.6831, 1.3483];
export const NTU_BOUNDS: [[number, number], [number, number]] = [NTU_BOUNDS_SW, NTU_BOUNDS_NE];

export const CAMERA_MIN_ZOOM = 14;
export const CAMERA_MAX_ZOOM = 19;
export const CAMERA_DEFAULT_ZOOM = 15.5;
export const CAMERA_DEFAULT_PITCH = 45;
export const CAMERA_DEFAULT_BEARING = -17.6;

export interface ExitPoint {
  id: string;
  label: string;
  coordinate: [number, number];
}

export const EXIT_POINTS: ExitPoint[] = [
  { id: "exit-a", label: "Exit A (Main Gate)", coordinate: [103.678, 1.335] },
  { id: "exit-b", label: "Exit B (Hall Gate)", coordinate: [103.686, 1.34] },
  { id: "exit-c", label: "Exit C (Sports Gate)", coordinate: [103.681, 1.327] },
  { id: "exit-d", label: "Exit D (Ayer Rajah)", coordinate: [103.6755, 1.332] },
  { id: "exit-e", label: "Exit E (North Gate)", coordinate: [103.684, 1.343] }
];
