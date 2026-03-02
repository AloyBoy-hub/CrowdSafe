/**
 * Sector convention: backend uses quadrants 0=NE, 1=NW, 2=SE, 3=SW.
 * Display labels: North (0+1), South (2+3), East (0+2), West (1+3).
 */
export const SECTOR_NAMES = ["North", "South", "East", "West"] as const;
export type SectorName = (typeof SECTOR_NAMES)[number];

/** Quadrant index to which "display" sectors an agent belongs (each agent is in one quadrant). */
const QUAD_TO_NORTH_SOUTH: Record<number, SectorName> = { 0: "North", 1: "North", 2: "South", 3: "South" };
const QUAD_TO_EAST_WEST: Record<number, SectorName> = { 0: "East", 1: "West", 2: "East", 3: "West" };

export function quadrantToSectorLabels(quadrant: number): { northSouth: SectorName; eastWest: SectorName } {
  return {
    northSouth: QUAD_TO_NORTH_SOUTH[quadrant] ?? "North",
    eastWest: QUAD_TO_EAST_WEST[quadrant] ?? "East"
  };
}

/** Count agents per display sector (North, South, East, West). Each agent counted in two (N or S and E or W). */
export function countAgentsBySector(
  agents: { sector: number }[]
): Record<SectorName, number> {
  const out: Record<SectorName, number> = { North: 0, South: 0, East: 0, West: 0 };
  for (const a of agents) {
    const { northSouth, eastWest } = quadrantToSectorLabels(a.sector);
    out[northSouth] += 1;
    out[eastWest] += 1;
  }
  return out;
}

/** Count agents in each quadrant (0-3). Sum of quadrant counts = total agents. */
export function countAgentsByQuadrant(agents: { sector: number }[]): [number, number, number, number] {
  const q = [0, 0, 0, 0];
  for (const a of agents) {
    if (a.sector >= 0 && a.sector <= 3) q[a.sector] += 1;
  }
  return [q[0], q[1], q[2], q[3]];
}

/** Base path for sector CCTV GIFs (e.g. /static/cctv/north.gif). */
export function sectorCctvGifPath(sector: SectorName): string {
  return `/static/cctv/${sector.toLowerCase()}.gif`;
}
