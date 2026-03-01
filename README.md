# CrowdSafe

CrowdSafe is a real-time crowd simulation and intelligent evacuation management platform for large venues.  
This repository currently contains **Module 1 (skeleton)** for the NTU Singapore demo site.

## Module 1 Scope

- Frontend scaffold with:
  - React 18 + TypeScript + Vite + Tailwind
  - Routing for `/` (Map View) and `/dashboard` (Dashboard shell)
  - Zustand simulation store
  - WebSocket hydration hook (`ws://localhost:8000/ws`)
  - Mapbox GL map canvas centered on NTU (`lat 1.3483`, `lng 103.6831`)
- Backend scaffold with:
  - FastAPI app + CORS + lifespan manager
  - `GET /health`
  - `WebSocket /ws` mock frame broadcast every 100ms
  - REST stubs for config, hazard, sensor override, and exit status updates
  - Pydantic schemas + simulation defaults

## Tech Stack

- Frontend: React 18, TypeScript, Tailwind CSS, Zustand, Mapbox GL JS, Vite
- Backend: FastAPI (Python 3.11), Uvicorn, Pydantic

## Project Structure

```text
.
├─ src/
│  ├─ components/
│  ├─ hooks/
│  ├─ lib/
│  ├─ pages/
│  └─ store/
├─ backend/
│  ├─ models/
│  ├─ routing/
│  ├─ simulation/
│  ├─ config.py
│  └─ main.py
└─ README.md
```

## Prerequisites

- Node.js 18+ and npm
- Python 3.11+

## Setup

### 1. Install frontend dependencies

```bash
npm install
```

### 2. Install backend dependencies

```bash
cd backend
python -m pip install -r requirements.txt
cd ..
```

## Run Locally

Start backend:

```bash
cd backend
uvicorn main:app --reload
```

Start frontend (new terminal):

```bash
npm run dev
```

Open:

- Map view: `http://127.0.0.1:5173/`
- Dashboard: `http://127.0.0.1:5173/dashboard`
- API health: `http://127.0.0.1:8000/health`

## Environment Variables

Frontend (`.env` at repo root):

```bash
VITE_API_BASE_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws
VITE_MAPBOX_TOKEN=your_mapbox_token
VITE_MAPBOX_STYLE_URL=mapbox://styles/mapbox/streets-v12
```

Notes:

- If `VITE_MAPBOX_TOKEN` is not set, the app falls back to an OpenStreetMap raster style.

## API Endpoints (Module 1)

- `GET /health` -> `{ "status": "ok" }`
- `POST /config`
- `POST /hazard`
- `POST /sensor-override`
- `POST /exit/{id}/status`
- `WS /ws` (simulation frames at 10 Hz)

## WebSocket Frame Shape

```json
{
  "frame": 1042,
  "agents": [
    {
      "id": "a001",
      "lat": 1.3481,
      "lng": 103.6835,
      "status": "evacuating",
      "sector": 2,
      "exit_target": "main_gate",
      "path_eta_s": 87
    }
  ],
  "heatmap_cells": [{ "lat": 1.348, "lng": 103.6832, "density": 0.73 }],
  "exits": [
    {
      "id": "main_gate",
      "lat": 1.3462,
      "lng": 103.6814,
      "capacity": 500,
      "queue": 312,
      "status": "open",
      "override": false
    }
  ],
  "hazards": [{ "id": "h1", "lat": 1.3488, "lng": 103.684, "radius_m": 50, "type": "fire" }],
  "alerts": [
    {
      "id": "al3",
      "ts": 1711900234,
      "reason": "exit_blocked",
      "old_exit": "north_gate",
      "new_exit": "main_gate",
      "affected": 143
    }
  ]
}
```

## Build Check

```bash
npm run build
```

## Current Status

Module 1 is ready as a stable base for upcoming simulation, routing, evacuation, and dashboard feature modules.
