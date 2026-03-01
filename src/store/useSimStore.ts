import { create } from "zustand";
import type { Agent, Alert, Exit, Hazard, HeatmapCell, SimConfig, SimFrame } from "../lib/types";

const defaultConfig: SimConfig = {
  agent_speed_mps: 1.4,
  crowd_size_multiplier: 1,
  sector_count: 4,
  simulation_hz: 10,
  gate_overrides: {}
};

interface AgentsSlice {
  agents: Agent[];
  setAgents: (agents: Agent[]) => void;
}

interface HazardsSlice {
  hazards: Hazard[];
  setHazards: (hazards: Hazard[]) => void;
}

interface ExitsSlice {
  exits: Exit[];
  setExits: (exits: Exit[]) => void;
}

interface AlertsSlice {
  alerts: Alert[];
  setAlerts: (alerts: Alert[]) => void;
}

interface ConfigSlice {
  config: SimConfig;
  setConfig: (config: Partial<SimConfig>) => void;
}

interface FrameSlice {
  frame: number;
  heatmapCells: HeatmapCell[];
  setFrame: (frame: SimFrame) => void;
}

type SimStore = AgentsSlice & HazardsSlice & ExitsSlice & AlertsSlice & ConfigSlice & FrameSlice;

export const useSimStore = create<SimStore>((set) => ({
  agents: [],
  setAgents: (agents) => set({ agents }),
  hazards: [],
  setHazards: (hazards) => set({ hazards }),
  exits: [],
  setExits: (exits) => set({ exits }),
  alerts: [],
  setAlerts: (alerts) => set({ alerts }),
  config: defaultConfig,
  setConfig: (config) =>
    set((state) => ({
      config: {
        ...state.config,
        ...config
      }
    })),
  frame: 0,
  heatmapCells: [],
  setFrame: (frame) =>
    set({
      frame: frame.frame,
      agents: frame.agents,
      heatmapCells: frame.heatmap_cells,
      exits: frame.exits,
      hazards: frame.hazards,
      alerts: frame.alerts
    })
}));

