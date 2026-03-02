import type { Agent, AgentStatus, SimFrame } from "./types";

export interface EvacHistoryPoint {
  ts: number;
  normal: number;
  evacuating: number;
  safe: number;
}

const MAX_HISTORY = 300;
let lastSampleSecond = 0;
const evacuationHistory: EvacHistoryPoint[] = [];

function countByStatus(agents: Array<Pick<Agent, "status">>, status: AgentStatus): number {
  let count = 0;
  for (const agent of agents) {
    if (agent.status === status) count += 1;
  }
  return count;
}

export function ingestAgentMetrics(agents: Array<Pick<Agent, "status">>): void {
  const nowSecond = Math.floor(Date.now() / 1000);
  if (nowSecond === lastSampleSecond) return;
  lastSampleSecond = nowSecond;

  evacuationHistory.push({
    ts: nowSecond * 1000,
    normal: countByStatus(agents, "normal"),
    evacuating: countByStatus(agents, "evacuating"),
    safe: countByStatus(agents, "safe")
  });

  if (evacuationHistory.length > MAX_HISTORY) {
    evacuationHistory.splice(0, evacuationHistory.length - MAX_HISTORY);
  }
}

export function ingestFrameMetrics(frame: SimFrame): void {
  ingestAgentMetrics(frame.agents);
}

export function getEvacuationHistory(): EvacHistoryPoint[] {
  return evacuationHistory.slice();
}
