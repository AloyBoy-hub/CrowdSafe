export type AgentStatus = "normal" | "evacuating" | "safe" | "danger";
export type ExitStatus = "open" | "congested" | "blocked";
export type HazardType = "fire" | "smoke" | "other";

export interface Agent {
  id: string;
  lat: number;
  lng: number;
  status: AgentStatus;
  sector: number;
  exit_target: string | null;
  path_eta_s: number | null;
}

export interface HeatmapCell {
  lat: number;
  lng: number;
  density: number;
}

export interface Exit {
  id: string;
  name?: string;
  lat: number;
  lng: number;
  // Number of agents currently within the load radius around the exit.
  queue: number;
  status: ExitStatus;
  override: boolean;
}

export interface Hazard {
  id: string;
  lat: number;
  lng: number;
  radius_m: number;
  type: HazardType;
}

export interface Alert {
  id: string;
  ts: number;
  reason: string;
  old_exit: string | null;
  new_exit: string | null;
  affected: number;
  acknowledged?: boolean;
}

export interface SimConfig {
  agent_speed_mps: number;
  crowd_size_multiplier: number;
  sector_count: number;
  simulation_hz: number;
  gate_overrides: Record<string, number>;
}

export interface SimFrame {
  frame: number;
  agents: Agent[];
  heatmap_cells: HeatmapCell[];
  exits: Exit[];
  hazards: Hazard[];
  alerts: Alert[];
}

export interface StatsSnapshot {
  total_population: number;
  evacuated: number;
  in_danger_zone: number;
  avg_eta_s: number;
  busiest_exit: string | null;
  active_hazards: number;
  frame: number;
}

export type ConfigUpdateRequest = Partial<SimConfig>;

export interface HazardCreateRequest {
  lat: number;
  lng: number;
  radius_m: number;
  type: HazardType;
}

export interface SensorOverrideRequest {
  gate_id: string;
  people_per_min: number;
}

export interface ExitStatusUpdateRequest {
  status: ExitStatus;
}

export interface HealthResponse {
  status: "ok";
}
