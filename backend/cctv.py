"""
CCTV Demo: POST /api/cctv/detect (legacy) and POST /api/cctv/workflow (Roboflow Serverless Workflow).
Workflow: single image in -> annotated image + count + boxes out. Keys stay server-side.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Any

import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger("crowdsafe.cctv")

ROBOFLOW_DETECT_BASE = "https://detect.roboflow.com"
ROBOFLOW_SERVERLESS_BASE = "https://serverless.roboflow.com"
PERSON_CLASSES = frozenset({"person", "people"})
DEFAULT_WORKSPACE = "abhijith-cbdhq"
DEFAULT_WORKFLOW_ID = "detect-count-and-visualize"


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


class CctvWorkflowRequest(BaseModel):
    image_b64: str = Field(..., description="Base64-encoded image (no data URL prefix)")


class FrameSize(BaseModel):
    width: int
    height: int


class CctvWorkflowResponse(BaseModel):
    count: int
    annotated_image_b64: str
    frame: FrameSize
    boxes: list[Box]


router = APIRouter(prefix="/cctv", tags=["cctv"])


def _workflow_predictions_to_boxes(preds: list[Any], frame_w: int, frame_h: int) -> list[dict[str, float]]:
    """Filter class==person (case-insensitive), center to top-left (x0=x-width/2, y0=y-height/2), clamp to frame."""
    boxes: list[dict[str, float]] = []
    for p in preds:
        if not isinstance(p, dict):
            continue
        cls_name = (p.get("class") or p.get("class_name") or "").strip().lower()
        if cls_name != "person":
            continue
        try:
            x_center = float(p.get("x", 0))
            y_center = float(p.get("y", 0))
            w = float(p.get("width", 0))
            h = float(p.get("height", 0))
        except (TypeError, ValueError):
            continue
        if w <= 0 or h <= 0:
            continue
        x0 = x_center - w / 2
        y0 = y_center - h / 2
        x0 = max(0.0, min(float(frame_w), x0))
        y0 = max(0.0, min(float(frame_h), y0))
        w = max(0.0, min(w, float(frame_w) - x0))
        h = max(0.0, min(h, float(frame_h) - y0))
        if w <= 0 or h <= 0:
            continue
        boxes.append({"x": x0, "y": y0, "w": w, "h": h})
    return boxes


@router.post("/workflow", response_model=CctvWorkflowResponse)
def cctv_workflow(payload: CctvWorkflowRequest) -> CctvWorkflowResponse:
    logger.info("[workflow] 1. Request received.")
    api_key = os.environ.get("ROBOFLOW_API_KEY", "").strip()
    if not api_key:
        logger.warning("[workflow] 1. Missing ROBOFLOW_API_KEY.")
        raise HTTPException(
            status_code=500,
            detail="CCTV workflow requires ROBOFLOW_API_KEY in environment.",
        )
    workspace = os.environ.get("ROBOFLOW_WORKSPACE", DEFAULT_WORKSPACE).strip()
    workflow_id = os.environ.get("ROBOFLOW_WORKFLOW_ID", DEFAULT_WORKFLOW_ID).strip()
    logger.info("[workflow] 2. Env: workspace=%s, workflow_id=%s", workspace, workflow_id)

    try:
        raw = base64.b64decode(payload.image_b64, validate=True)
    except Exception as e:
        logger.warning("[workflow] 2. Base64 decode failed: %s", e)
        raise HTTPException(status_code=400, detail=f"Invalid base64 image: {e}")
    if len(raw) > 10 * 1024 * 1024:
        logger.warning("[workflow] 2. Image too large: %s bytes", len(raw))
        raise HTTPException(status_code=400, detail="Image too large")
    logger.info("[workflow] 3. Base64 decoded OK, size=%s bytes", len(raw))

    tmp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
            f.write(raw)
            tmp_path = f.name
        logger.info("[workflow] 4. Temp file written: %s", tmp_path)

        from inference_sdk import InferenceHTTPClient

        client = InferenceHTTPClient(
            api_url=ROBOFLOW_SERVERLESS_BASE,
            api_key=api_key,
        )
        logger.info("[workflow] 5. Calling run_workflow(workspace=%s, workflow_id=%s)...", workspace, workflow_id)
        result = client.run_workflow(
            workspace_name=workspace,
            workflow_id=workflow_id,
            images={"image": tmp_path},
            use_cache=True,
        )

        result_len = len(result) if isinstance(result, (list, tuple)) else "n/a"
        logger.info("[workflow] 6. Result type=%s, len=%s", type(result).__name__, result_len)

        if not isinstance(result, list):
            snippet = repr(result)[:300] if result is not None else "None"
            raise HTTPException(
                status_code=502,
                detail=f"Workflow result is not a list (got {type(result).__name__}). Snippet: {snippet}",
            )
        if len(result) == 0:
            raise HTTPException(status_code=502, detail="Workflow returned empty list.")

        out = result[0]
        if isinstance(out, dict):
            def _safe_type(v: Any) -> str:
                t = type(v).__name__
                if isinstance(v, (str, bytes, list, dict)):
                    return f"{t}(len={len(v)})"
                return t
            shape = {k: _safe_type(v) for k, v in out.items()}
            logger.info("[workflow] 7. result[0] keys=%s, value types=%s", list(out.keys()), shape)
        else:
            logger.info("[workflow] 7. result[0] type=%s", type(out).__name__)
        if not isinstance(out, dict):
            raise HTTPException(
                status_code=502,
                detail=f"Workflow result[0] is not a dict (got {type(out).__name__}).",
            )

        if "output_image" not in out:
            keys = [k for k in sorted(out.keys()) if "key" not in k.lower() and "api" not in k.lower()]
            raise HTTPException(
                status_code=502,
                detail=f"output_image missing from workflow output. Keys: {', '.join(keys)}",
            )
        output_image = out["output_image"]
        logger.info("[workflow] 8. output_image type=%s (if dict, keys=%s)", type(output_image).__name__, list(output_image.keys()) if isinstance(output_image, dict) else "n/a")
        if isinstance(output_image, str):
            annotated_b64 = output_image.strip()
        elif isinstance(output_image, dict):
            if "value" not in output_image:
                keys = [k for k in sorted(output_image.keys()) if "key" not in k.lower() and "api" not in k.lower()]
                raise HTTPException(
                    status_code=502,
                    detail=f"output_image.value missing. output_image keys: {', '.join(keys)}",
                )
            annotated_b64 = output_image["value"]
            if isinstance(annotated_b64, bytes):
                annotated_b64 = annotated_b64.decode("ascii", errors="replace")
            annotated_b64 = str(annotated_b64).strip()
        else:
            raise HTTPException(
                status_code=502,
                detail=f"output_image must be str or dict (got {type(output_image).__name__}).",
            )
        logger.info("[workflow] 8b. annotated_b64 len=%s", len(annotated_b64))

        count = int(out["count_objects"]) if "count_objects" in out else 0
        logger.info("[workflow] 9. count_objects=%s", count)

        preds_root = out.get("predictions")
        if not isinstance(preds_root, dict):
            raise HTTPException(
                status_code=502,
                detail=f"predictions missing or not a dict. out keys: {', '.join(k for k in sorted(out.keys()) if 'key' not in k.lower() and 'api' not in k.lower())}",
            )
        img_info = preds_root.get("image")
        if not isinstance(img_info, dict):
            frame_w, frame_h = 640, 480
        else:
            frame_w = int(img_info.get("width", 0)) or 640
            frame_h = int(img_info.get("height", 0)) or 480
        preds = preds_root.get("predictions")
        if not isinstance(preds, list):
            preds = []
        logger.info("[workflow] 10. frame=%sx%s, preds count=%s", frame_w, frame_h, len(preds))

        boxes = _workflow_predictions_to_boxes(preds, frame_w, frame_h)
        logger.info("[workflow] 11. person boxes count=%s", len(boxes))

        return CctvWorkflowResponse(
            count=count,
            annotated_image_b64=annotated_b64,
            frame=FrameSize(width=frame_w, height=frame_h),
            boxes=[Box(**b) for b in boxes],
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("[workflow] Exception: %s", e, exc_info=True)
        raise HTTPException(
            status_code=502,
            detail="Roboflow workflow failed. Check workspace, workflow ID, and API key.",
        )
    finally:
        if tmp_path and Path(tmp_path).exists():
            try:
                os.unlink(tmp_path)
                logger.info("[workflow] 12. Temp file deleted: %s", tmp_path)
            except OSError as e:
                logger.warning("[workflow] 12. Failed to delete temp file %s: %s", tmp_path, e)


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
