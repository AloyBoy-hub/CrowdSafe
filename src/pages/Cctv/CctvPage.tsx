/**
 * CCTV Demo: webcam feed, person bounding boxes from backend detection,
 * live people count at ~3 fps. UI matches Dashboard/Command Centre style.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Map as MapIcon, Video } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api";

const FPS = 3;
const INTERVAL_MS = 1000 / FPS;
const JPEG_QUALITY = 0.7;
const COUNT_EMA_ALPHA = 0.35;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export default function CctvPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const [displayCount, setDisplayCount] = useState<number>(0);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [webcamReady, setWebcamReady] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const prevCountRef = useRef(0);

  const drawBoxes = useCallback(
    (rawBoxes: Box[], frameW: number, frameH: number) => {
      const overlay = overlayRef.current;
      const video = videoRef.current;
      if (!overlay || !video || frameW <= 0 || frameH <= 0) return;
      let overlayW = overlay.width;
      let overlayH = overlay.height;
      if (overlayW <= 0 || overlayH <= 0) {
        const rect = video.getBoundingClientRect();
        overlayW = Math.floor(rect.width);
        overlayH = Math.floor(rect.height);
        if (overlayW <= 0 || overlayH <= 0) return;
        overlay.width = overlayW;
        overlay.height = overlayH;
      }
      const scaleX = overlayW / frameW;
      const scaleY = overlayH / frameH;
      const ctx = overlay.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, overlayW, overlayH);
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2;
      for (const b of rawBoxes) {
        const x = b.x * scaleX;
        const y = b.y * scaleY;
        const w = b.w * scaleX;
        const h = b.h * scaleY;
        ctx.strokeRect(x, y, w, h);
      }
    },
    []
  );

  const tick = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || inFlightRef.current) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w <= 0 || h <= 0) return;

    let offscreen = offscreenRef.current;
    if (!offscreen) {
      offscreen = document.createElement("canvas");
      offscreen.width = w;
      offscreen.height = h;
      offscreenRef.current = offscreen;
    } else {
      offscreen.width = w;
      offscreen.height = h;
    }
    const ctx = offscreen.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    let dataUrl: string;
    try {
      dataUrl = offscreen.toDataURL("image/jpeg", JPEG_QUALITY);
    } catch {
      return;
    }
    const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
    inFlightRef.current = true;
    try {
      setDetectError(null);
      const res = await apiClient.cctvDetect({ image_b64: base64, width: w, height: h });
      const newCount = res.count;
      const smoothed = Math.round(
        COUNT_EMA_ALPHA * newCount + (1 - COUNT_EMA_ALPHA) * prevCountRef.current
      );
      prevCountRef.current = smoothed;
      setDisplayCount(smoothed);
      setBoxes(res.boxes);
      drawBoxes(res.boxes, w, h);
    } catch (err) {
      let msg = "Detection unavailable";
      if (err instanceof ApiError && err.body && typeof err.body === "object" && "detail" in err.body) {
        msg = String((err.body as { detail?: string }).detail);
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setDetectError(msg);
    } finally {
      inFlightRef.current = false;
    }
  }, [drawBoxes]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        video.srcObject = stream;
        setWebcamReady(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !webcamReady) return;

    const onReady = () => {
      intervalRef.current = setInterval(tick, INTERVAL_MS);
    };
    if (video.readyState >= 2) onReady();
    else {
      video.addEventListener("loadedmetadata", onReady, { once: true });
      video.addEventListener("canplay", onReady, { once: true });
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [webcamReady, tick]);

  const resizeOverlay = useCallback(() => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay) return;
    const rect = video.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    overlay.width = w;
    overlay.height = h;
    if (boxes.length > 0 && video.videoWidth > 0) {
      drawBoxes(boxes, video.videoWidth, video.videoHeight);
    }
  }, [boxes, drawBoxes]);

  useEffect(() => {
    resizeOverlay();
    const video = videoRef.current;
    if (!video) return;
    const ro = new ResizeObserver(resizeOverlay);
    ro.observe(video);
    return () => ro.disconnect();
  }, [resizeOverlay, boxes]);

  return (
    <div className="min-h-screen overflow-y-auto bg-[#0A0E1A] text-[#F1F5F9]">
      <header className="m-3 flex h-14 items-center justify-between rounded-xl border border-[#1E2D4A] bg-[#0F1629] px-4">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-widest text-slate-200">CCTV</span>
          <span className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] uppercase tracking-wide text-emerald-300">
            <Video className="h-3 w-3" />
            Webcam
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/dashboard"
            className="ui-button border border-[#1E2D4A] bg-[#1A2540] text-slate-200"
          >
            <span className="inline-flex items-center gap-1">
              <MapIcon className="h-4 w-4" />
              Command Centre
            </span>
          </Link>
        </div>
      </header>

      <main className="grid grid-cols-1 gap-4 px-3 pb-3">
        <article className="ui-card border border-[#1E2D4A] bg-[#0F1629] p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
            Live feed
          </p>
          <div className="relative inline-block w-full overflow-hidden rounded-lg bg-black">
            <video
              ref={videoRef}
              className="block w-full"
              playsInline
              muted
              autoPlay
            />
            <canvas
              ref={overlayRef}
              className="pointer-events-none absolute left-0 top-0 rounded-lg"
              style={{ width: "100%", height: "100%" }}
            />
          </div>
        </article>

        <article className="ui-card border border-emerald-500/40 bg-[#0F1629] p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            People on screen
          </p>
          <div className="mt-3 flex items-center gap-2">
            <p className="font-mono text-3xl font-bold tabular-nums text-slate-100">
              {displayCount}
            </p>
            <span className="text-emerald-300">detected</span>
          </div>
          {detectError && (
            <p className="mt-2 text-xs text-amber-400">{detectError}</p>
          )}
        </article>
      </main>
    </div>
  );
}
