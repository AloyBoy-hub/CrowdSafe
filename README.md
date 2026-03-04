# CrowdSafe

CrowdSafe is a real-time crowd simulation and intelligent evacuation management platform for large venues (e.g. stadiums). It includes a command-centre dashboard, live map, CCTV-style person detection, sector-based crowd tracking, and a mobile attendee view that receives evacuation redirects in real time.

## Features

- **Landing & map** — Landing at `/`, interactive Mapbox map at `/map` with agents, exits, and hazards. Agent sectors (North / East / West / South) are assigned at spawn and shown in tooltips.
- **Dashboard** — Command centre at `/dashboard`: total in stadium, evacuation progress, exit load chart, crowd-by-sector breakdown, alert log, CCTV preview with sector dropdown, minimap (links to map), and controls to send notifications to attendees or first responders.
- **CCTV** — `/cctv`: choose sector, capture from webcam or upload an image; Roboflow workflow returns person count and annotated image. People-by-sector totals update as you scan; clicking the total or card takes you back to the map.
- **Mobile** — `/mobile`: simple attendee view with hardcoded location, sector, and nearest exit; indoor map image; when the dashboard sends a notification, all connected mobile clients see a popup with the redirect exit.

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Zustand, Mapbox GL JS, Recharts
- **Backend:** FastAPI (Python 3.11+), Uvicorn, Pydantic
- **Integrations:** Roboflow (workflow + optional detection API) for CCTV

## Project Structure

```text
.
├── src/
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   ├── pages/
│   │   ├── Dashboard/    # Stat cards, charts, CCTV card, alert log, notification modal
│   │   ├── MapView/      # Interactive map + simulation
│   │   ├── Cctv/         # CCTV Feed (workflow scan)
│   │   ├── Mobile/        # Mobile attendee page
│   │   └── Landing/
│   └── store/            # Zustand simulation store
├── backend/
│   ├── models/
│   ├── routing/
│   ├── config.py         # Sectors, exits, hazards, simulation config
│   ├── main.py           # FastAPI app, WebSocket, notify broadcast
│   └── cctv.py           # Roboflow workflow + detection
├── public/
│   └── static/           # Sample video, CCTV GIFs, indoor map (see below)
└── README.md
```

## Prerequisites

- Node.js 18+ and npm
- Python 3.11+

## Setup

### 1. Frontend dependencies

```bash
npm install
```

### 2. Backend dependencies

```bash
cd backend
python -m pip install -r requirements.txt
cd ..
```

### 3. Environment

Create a root `.env` (repo root). Frontend and backend both use it.

```bash
# Frontend
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_WS_URL=ws://127.0.0.1:8000/ws
VITE_MAPBOX_TOKEN=your_mapbox_token
# Optional: VITE_MAPBOX_STYLE_URL=mapbox://styles/mapbox/streets-v12

# Backend – Roboflow (CCTV workflow + optional legacy detect)
ROBOFLOW_API_KEY=your_private_key
ROBOFLOW_WORKSPACE=your_workspace
ROBOFLOW_WORKFLOW_ID=detect-count-and-visualize
# Optional for legacy /api/cctv/detect:
# ROBOFLOW_MODEL=workspace/project/version
```

You may also try with our public API keys
```bash
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_WS_URL=ws://127.0.0.1:8000/ws
VITE_MAPBOX_TOKEN="pk.eyJ1IjoiZ3JlbmFkZWZhbiIsImEiOiJjbW03cm9sZzEwcGdjMndyMXBtMWxpaDV3In0.389Vf9wxE7g0rw4AAvf95g"

# Backend: Roboflow (CCTV demo). Format: workspace/project/version
ROBOFLOW_API_KEY="GZa02vhGRI5kPsbzlYXh"
ROBOFLOW_MODEL="people-detection-o4rdr/11"
```

- **Mapbox:** Ensure that you specify the URL in which you are hosting the frontend (e.g., http://127.0.0.1:5173/).
- **Roboflow:** Get API key from [Roboflow settings](https://app.roboflow.com/settings/api). Workflow is used for `/cctv` (person count + annotated image).

## Run Locally

**Terminal 1 – backend:**

```bash
cd backend
uvicorn main:app --reload
```

**Terminal 2 – frontend:**

```bash
npm run dev
```

Then open:

| Page        | URL                              |
|------------|-----------------------------------|
| Landing    | http://127.0.0.1:5173/            |
| Map        | http://127.0.0.1:5173/map         |
| Dashboard  | http://127.0.0.1:5173/dashboard   |
| CCTV Feed  | http://127.0.0.1:5173/cctv        |
| Mobile     | http://127.0.0.1:5173/mobile      |
| API health | http://127.0.0.1:8000/health      |

## Static Assets (public/static)

- **CCTV sample video:** `cctv-sample.mp4` — used at `/cctv` when present; otherwise webcam.
- **Dashboard CCTV preview:** `cctv-preview.gif` — optional; legacy single preview.
- **Sector CCTV GIFs:** In `public/static/cctv/`: `north.gif`, `south.gif`, `east.gif`, `west.gif` for per-sector previews on dashboard and CCTV page.
- **Mobile indoor map:** `map.png`, `map.jpg`, or `map.jpeg` in `public/static/`. The `/mobile` page tries `.png` first, then `.jpg`, then `.jpeg`.

See `public/static/README.txt` and `public/static/cctv/README.txt` for details.

## Sectors

Agents are assigned to one of four sectors (**North, East, West, South**) at spawn based on position relative to the spawn-area centroid. This assignment is permanent. The dashboard “Crowd by sector” and map tooltips use this; the CCTV sector dropdown and per-sector counts on `/cctv` align with the same model.

## Notifications (Dashboard → Mobile)

1. On the **dashboard**, click **“Send notification to attendees”**.
2. In the modal: choose sectors, proportion, and **exit** to direct people to.
3. Click **“Send notification”**. The backend broadcasts a redirect to all WebSocket clients.
4. Every device with **`/mobile`** open and connected to the same backend receives a popup: **“You have been redirected to exit: [exit name]”**.

For phones on the same LAN, open the app at `http://<your-pc-ip>:5173/mobile` and ensure the backend is reachable at `<your-pc-ip>:8000`. If needed, set `VITE_WS_URL=ws://<your-pc-ip>:8000/ws` and restart the dev server.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET    | `/health` | Health check |
| GET    | `/stats/snapshot` | Simulation stats snapshot |
| POST   | `/config` | Update simulation config |
| POST   | `/hazard` | Add hazard |
| POST   | `/hazard/external` | Add external hazard |
| DELETE | `/hazard/{id}` | Remove hazard |
| POST   | `/evacuation/start` | Start evacuation |
| POST   | `/exit/{id}/status` | Update exit status |
| POST   | `/sensor-override` | Sensor override |
| POST   | `/api/cctv/detect` | Legacy person detection (image_b64, width, height) |
| POST   | `/api/cctv/workflow` | Roboflow workflow: body `{ "image_b64": "..." }` → count + annotated image + boxes |
| POST   | `/api/notify` | Broadcast redirect to all WS clients; body `{ "exit_id": "...", "exit_name": "..." }` |
| WS     | `/ws` | Simulation frames (10 Hz) + redirect messages (`type: "redirect"`) |

## WebSocket Messages

**Simulation frame** (periodic):

```json
{
  "frame": 1042,
  "agents": [{ "id": "a001", "lat": 1.3481, "lng": 103.6835, "status": "evacuating", "sector": 2, "exit_target": "exit_1", "path_eta_s": 87 }],
  "heatmap_cells": [...],
  "exits": [...],
  "hazards": [...],
  "alerts": [...]
}
```

**Redirect** (when dashboard sends notification):

```json
{
  "type": "redirect",
  "exitId": "exit_1",
  "exitName": "North Exit"
}
```

## Build

```bash
npm run build
```

## Current Status

- Landing, map, dashboard, CCTV (workflow + sector), and mobile page are implemented.
- Sectors are fixed at spawn; dashboard and map stay in sync via the shared store and backend frames.
- Notifications from the dashboard are broadcast to all connected mobile clients over WebSocket.
