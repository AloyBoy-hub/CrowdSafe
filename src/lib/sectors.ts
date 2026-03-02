export const SECTOR_NAMES = ["North", "East", "West", "South"] as const;
export type SectorName = (typeof SECTOR_NAMES)[number];
const STADIUM_CENTER_LAT = 1.3044176;
const STADIUM_CENTER_LNG = 103.8742997;

/**
 * Backend encodes sectors as integers:
 *   0 = North, 1 = East, 2 = South, 3 = West
 */
export function sectorIndexToName(sectorIndex: number): SectorName {
  switch (sectorIndex) {
    case 0:
      return "North";
    case 1:
      return "East";
    case 2:
      return "South";
    case 3:
      return "West";
    default:
      return "North";
  }
}

/**
 * Convert lat/lng to cardinal sector index around stadium center.
 * 0 = North, 1 = East, 2 = South, 3 = West
 */
export function latLngToSectorIndex(lat: number, lng: number): number {
  const dy = lat - STADIUM_CENTER_LAT;
  const dx = lng - STADIUM_CENTER_LNG;
  if (dx === 0 && dy === 0) return 0;

  const angleDeg = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
  if (angleDeg >= 45 && angleDeg < 135) return 0; // North
  if (angleDeg >= 135 && angleDeg < 225) return 3; // West
  if (angleDeg >= 225 && angleDeg < 315) return 2; // South
  return 1; // East
}

/** Count agents per sector (North, East, West, South). Each agent counted exactly once. */
export function countAgentsBySector(agents: { sector: number }[]): Record<SectorName, number> {
  const out: Record<SectorName, number> = { North: 0, East: 0, West: 0, South: 0 };
  for (const a of agents) {
    const name = sectorIndexToName(a.sector);
    out[name] += 1;
  }
  return out;
}

/** Base path for sector CCTV GIFs (e.g. /static/cctv/north.gif). */
export function sectorCctvGifPath(sector: SectorName): string {
  return `/static/cctv/${sector.toLowerCase()}.gif`;
}
