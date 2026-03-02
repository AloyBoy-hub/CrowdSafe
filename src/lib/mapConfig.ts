export const MAPBOX_ACCESS_TOKEN = "REPLACE_WITH_YOUR_MAPBOX_PUBLIC_TOKEN";
// Replace MAPBOX_ACCESS_TOKEN with your personal Mapbox public token (pk.*).

export function getMapboxToken(): string {
  const envToken = import.meta.env.VITE_MAPBOX_TOKEN?.trim();
  return envToken || MAPBOX_ACCESS_TOKEN;
}

export const OUTDOOR_STREETS_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";
export const OUTDOOR_SATELLITE_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";
export const OUTDOOR_STANDARD_STYLE = "mapbox://styles/mapbox/standard";

export const VENUE_BOUNDS_SW: [number, number] = [103.8725, 1.3026];
export const VENUE_BOUNDS_NE: [number, number] = [103.8766, 1.3062];
export const VENUE_CENTER: [number, number] = [103.8742997, 1.3044176];
export const VENUE_BOUNDS: [[number, number], [number, number]] = [VENUE_BOUNDS_SW, VENUE_BOUNDS_NE];

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
  { id: "exit_1", label: "Exit 1", coordinate: [103.8747054, 1.3034892] },
  { id: "exit_2", label: "Exit 2", coordinate: [103.875441, 1.3049481] },
  { id: "exit_3", label: "Exit 3", coordinate: [103.8733984, 1.3046189] }
];
