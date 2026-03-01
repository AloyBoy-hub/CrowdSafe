import type {
  ConfigUpdateRequest,
  ExitStatusUpdateRequest,
  Hazard,
  HazardCreateRequest,
  HealthResponse,
  SensorOverrideRequest,
  SimConfig,
  StatsSnapshot
} from "./types";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
export const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8000/ws";

const REQUEST_TIMEOUT_MS = 10000;

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {})
      }
    });

    if (!response.ok) {
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = await response.text();
      }

      throw new ApiError(`API request failed: ${response.status} ${response.statusText}`, response.status, body);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export const apiClient = {
  health: () => request<HealthResponse>("/health"),
  updateConfig: (payload: ConfigUpdateRequest) =>
    request<{ status: string; config: SimConfig }>("/config", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  placeHazard: (payload: HazardCreateRequest) =>
    request<Hazard>("/hazard", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  deleteHazard: (hazardId: string) =>
    request<{ status: string }>(`/hazard/${encodeURIComponent(hazardId)}`, {
      method: "DELETE"
    }),
  startEvacuation: () =>
    request<{ status: string; evacuation_mode: boolean; affected_agents: number }>("/evacuation/start", {
      method: "POST"
    }),
  setSensorOverride: (payload: SensorOverrideRequest) =>
    request<{ status: string }>("/sensor-override", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  setExitStatus: (exitId: string, payload: ExitStatusUpdateRequest) =>
    request<{ status: string }>(`/exit/${encodeURIComponent(exitId)}/status`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  getStatsSnapshot: () => request<StatsSnapshot>("/stats/snapshot")
};
