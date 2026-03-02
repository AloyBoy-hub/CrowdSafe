"""
CCTV Demo: POST /api/cctv/detect — accepts base64 image, calls Roboflow hosted
object detection, returns person bounding boxes + count. Keys stay server-side.
"""
from __future__ import annotations

import base64
import json
import logging
import os
from typing import Any

import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger("crowdsafe.cctv")

ROBOFLOW_DETECT_BASE = "https://detect.roboflow.com"
ROBOFLOW_SERVERLESS_BASE = "https://serverless.roboflow.com"
PERSON_CLASSES = frozenset({"person", "people"})


class CctvDetectRequest(BaseModel):
    image_b64: str = Field(..., description="Base64-encoded JPEG (no data URL prefix)")
    width: int = Field(..., gt=0, le=4096)
    height: int = Field(..., gt=0, le=4096)


class Box(BaseModel):
    x: float  # top-left
    y: float
    w: float
    h: float


class CctvDetectResponse(BaseModel):
    count: int
    boxes: list[Box]


router = APIRouter(prefix="/cctv", tags=["cctv"])


def _call_roboflow_hosted_v1(image_b64: str, api_key: str, path: str) -> dict[str, Any] | None:
    """Roboflow Hosted API: detect.roboflow.com with JSON body (image.type base64)."""
    url = f"{ROBOFLOW_DETECT_BASE}/{path}"
    payload = {
        "image": {"type": "base64", "value": image_b64},
        "api_key": api_key,
        "confidence": 0.4,
        "overlap": 0.3,
    }
    try:
        r = requests.post(url, json=payload, timeout=30)
    except requests.RequestException as e:
        logger.warning("Roboflow hosted request failed: %s", e)
        return None
    if r.status_code != 200:
        logger.info("Roboflow hosted returned %s: %s", r.status_code, (r.text or "")[:300])
        return None
    try:
        return r.json()
    except json.JSONDecodeError:
        return None


def _call_roboflow_serverless(image_b64: str, api_key: str, path: str) -> dict[str, Any] | None:
    """Roboflow Serverless: JSON body with image.type base64."""
    url = f"{ROBOFLOW_SERVERLESS_BASE}/{path}"
    payload = {"image": {"type": "base64", "value": image_b64}}
    try:
        r = requests.post(
            url,
            json=payload,
            params={"api_key": api_key},
            timeout=30,
        )
    except requests.RequestException as e:
        logger.warning("Roboflow serverless request failed: %s", e)
        return None
    if r.status_code != 200:
        logger.info("Roboflow serverless returned %s: %s", r.status_code, (r.text or "")[:300])
        return None
    try:
        return r.json()
    except json.JSONDecodeError:
        return None


def _call_roboflow(image_b64: str) -> dict[str, Any]:
    api_key = os.environ.get("ROBOFLOW_API_KEY", "").strip()
    model = os.environ.get("ROBOFLOW_MODEL", "").strip()
    if not api_key or not model:
        raise HTTPException(
            status_code=500,
            detail="CCTV detection requires ROBOFLOW_API_KEY and ROBOFLOW_MODEL in environment.",
        )
    path = model.strip("/")
    data = _call_roboflow_hosted_v1(image_b64, api_key, path)
    if data is None:
        data = _call_roboflow_serverless(image_b64, api_key, path)
    if data is None:
        raise HTTPException(
            status_code=502,
            detail="Roboflow detection failed. Check ROBOFLOW_MODEL (e.g. project_id/version) and API key.",
        )
    return data


def _predictions_to_boxes(data: dict[str, Any]) -> list[dict[str, float]]:
    """Extract person detections; convert to top-left x,y,w,h. Handles center and xyxy formats."""
    boxes: list[dict[str, float]] = []
    raw = data.get("predictions") or data.get("detections") or []
    if not raw and isinstance(data.get("data"), dict):
        raw = data["data"].get("predictions") or data["data"].get("detections") or []
    if not isinstance(raw, list):
        raw = []
    for p in raw:
        if not isinstance(p, dict):
            continue
        cls_name = (p.get("class") or p.get("class_name") or p.get("name") or "").strip().lower()
        if cls_name not in PERSON_CLASSES:
            continue
        x_center = p.get("x")
        y_center = p.get("y")
        w = p.get("width")
        h = p.get("height")
        x_min = p.get("x_min") or p.get("x1")
        y_min = p.get("y_min") or p.get("y1")
        x_max = p.get("x_max") or p.get("x2")
        y_max = p.get("y_max") or p.get("y2")
        if x_center is not None and y_center is not None and w is not None and h is not None:
            try:
                cx, cy = float(x_center), float(y_center)
                wf, hf = float(w), float(h)
                if wf <= 0 or hf <= 0:
                    continue
                x = cx - wf / 2
                y = cy - hf / 2
                boxes.append({"x": x, "y": y, "w": wf, "h": hf})
            except (TypeError, ValueError):
                pass
        elif x_min is not None and y_min is not None and x_max is not None and y_max is not None:
            try:
                x1, y1 = float(x_min), float(y_min)
                x2, y2 = float(x_max), float(y_max)
                if x2 <= x1 or y2 <= y1:
                    continue
                boxes.append({"x": x1, "y": y1, "w": x2 - x1, "h": y2 - y1})
            except (TypeError, ValueError):
                pass
    return boxes


@router.post("/detect", response_model=CctvDetectResponse)
def cctv_detect(payload: CctvDetectRequest) -> CctvDetectResponse:
    try:
        raw = base64.b64decode(payload.image_b64, validate=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 image: {e}")
    if len(raw) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large")
    data = _call_roboflow(payload.image_b64)
    boxes = _predictions_to_boxes(data)
    return CctvDetectResponse(count=len(boxes), boxes=[Box(**b) for b in boxes])
