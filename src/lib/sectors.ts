export const SECTOR_NAMES = ["North", "East", "West", "South"] as const;
export type SectorName = (typeof SECTOR_NAMES)[number];

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

/** Map sector label to store index (0=North, 1=East, 2=South, 3=West). */
export function sectorNameToIndex(name: string): number {
  switch (name) {
    case "North":
      return 0;
    case "East":
      return 1;
    case "South":
      return 2;
    case "West":
      return 3;
    default:
      return 0;
  }
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
