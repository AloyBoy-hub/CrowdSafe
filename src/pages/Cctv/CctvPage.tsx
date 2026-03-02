/**
 * CCTV / Scan item: capture or upload one image, show source in camera area,
 * processing spinner, then annotated result + count below. Sector dropdown to choose
 * which sector's CCTV is being surveilled; per-sector counts update as you scan.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Camera, Loader2, ScanLine, Upload } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api";
import { SECTOR_NAMES, type SectorName } from "@/lib/sectors";
import { BackgroundGradientAnimation } from "@/components/ui/background-gradient-animation";
import { Glass } from "@/components/ui/glass-effect";
import { GlassButton } from "@/components/ui/liquid-glass";
import { GlassCard } from "@/components/ui/glass-card";

const JPEG_QUALITY = 0.7;
const STABILIZATION_MS = 550;

type Status = "idle" | "capturing" | "uploading" | "processing" | "done" | "error";

const emptySectorCounts: Record<SectorName, number | null> = {
  North: null,
  South: null,
  East: null,
  West: null
};

export default function CctvPage() {
  const [searchParams] = useSearchParams();
  const sectorParam = searchParams.get("sector");
  const initialSector: SectorName =
    SECTOR_NAMES.includes(sectorParam as SectorName) ? (sectorParam as SectorName) : "North";
  const [status, setStatus] = useState<Status>("idle");
  const [selectedSector, setSelectedSector] = useState<SectorName>(initialSector);
  const [sectorCounts, setSectorCounts] = useState<Record<SectorName, number | null>>(() => ({ ...emptySectorCounts }));

  useEffect(() => {
    if (SECTOR_NAMES.includes(sectorParam as SectorName)) setSelectedSector(sectorParam as SectorName);
  }, [sectorParam]);
  const [sourceImageDataUrl, setSourceImageDataUrl] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [annotatedImageB64, setAnnotatedImageB64] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const busy = status === "capturing" || status === "uploading" || status === "processing";

  const totalAcrossSectors = (["North", "East", "West", "South"] as const).reduce((sum, name) => {
    const value = sectorCounts[name];
    return sum + (typeof value === "number" ? value : 0);
  }, 0);
  const hasAnySectorCount = Object.values(sectorCounts).some((v) => typeof v === "number");

  async function runWorkflow(imageB64: string) {
    setErrorMessage(null);
    setStatus("processing");
    try {
      const res = await apiClient.cctvWorkflow({ image_b64: imageB64 });
      setCount(res.count);
      setAnnotatedImageB64(res.annotated_image_b64);
      setSectorCounts((prev) => ({ ...prev, [selectedSector]: res.count }));
      setStatus("done");
    } catch (err) {
      setStatus("error");
      if (err instanceof ApiError && err.body && typeof err.body === "object" && "detail" in err.body) {
        setErrorMessage(String((err.body as { detail?: string }).detail));
      } else if (err instanceof Error) {
        if (err.message.toLowerCase().includes("abort") || err.name === "AbortError") {
          setErrorMessage("Request timed out. The workflow can take up to a minute—please try again.");
        } else {
          setErrorMessage(err.message);
        }
      } else {
        setErrorMessage("Workflow request failed.");
      }
    }
  }

  async function handleWebcam() {
    if (busy) return;
    setErrorMessage(null);
    setSourceImageDataUrl(null);
    setCount(null);
    setAnnotatedImageB64(null);
    setStatus("capturing");
    // sectorCounts stay; we'll update selectedSector's count when workflow returns
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch (e) {
      setStatus("error");
      setErrorMessage("Camera access denied or unavailable.");
      return;
    }

    const video = document.createElement("video");
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;

    const captureOneFrame = () => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (w <= 0 || h <= 0) return;
      stream?.getTracks().forEach((t) => t.stop());
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setStatus("error");
        setErrorMessage("Could not capture frame.");
        return;
      }
      ctx.drawImage(video, 0, 0, w, h);
      let dataUrl: string;
      try {
        dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
      } catch {
        setStatus("error");
        setErrorMessage("Could not encode image.");
        return;
      }
      setSourceImageDataUrl(dataUrl);
      const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
      runWorkflow(base64);
    };

    const onCanPlay = () => {
      window.setTimeout(() => {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          captureOneFrame();
        } else {
          const check = () => {
            if (video.videoWidth > 0 && video.videoHeight > 0) captureOneFrame();
            else requestAnimationFrame(check);
          };
          requestAnimationFrame(check);
        }
      }, STABILIZATION_MS);
    };

    video.addEventListener("canplay", onCanPlay, { once: true });
    video.play().catch(() => {
      setStatus("error");
      setErrorMessage("Could not start camera.");
      stream?.getTracks().forEach((t) => t.stop());
    });
  }

  function handleUploadChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (busy) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMessage(null);
    setCount(null);
    setAnnotatedImageB64(null);
    setStatus("uploading");
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setSourceImageDataUrl(dataUrl);
      const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
      runWorkflow(base64);
    };
    reader.onerror = () => {
      setStatus("error");
      setErrorMessage("Failed to read file.");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  return (
    <BackgroundGradientAnimation
      interactive={false}
      gradientBackgroundStart="rgb(2, 6, 18)"
      gradientBackgroundEnd="rgb(6, 12, 28)"
      firstColor="18, 62, 158"
      secondColor="26, 84, 181"
      thirdColor="10, 86, 171"
      fourthColor="12, 42, 112"
      fifthColor="38, 72, 148"
      pointerColor="45, 81, 176"
      blendingValue="soft-light"
      containerClassName="min-h-screen !h-auto !w-full overflow-visible"
      className="min-h-screen font-hero-space text-[15px] text-[#F1F5F9] [&_.text-xs]:text-sm [&_.text-sm]:text-base"
    >
      <Glass className="top-3 z-40" width="w-[calc(100vw-1.5rem)]" height="h-12" effectClassName="opacity-20">
        <header className="flex h-full items-center justify-between px-3 text-slate-900 dark:text-slate-100">
          <div className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-slate-300" />
            <span className="text-base font-bold tracking-widest text-slate-200">CCTV Feed</span>
          </div>
          <div className="flex items-center gap-2">
            <GlassButton
              type="button"
              onClick={() => (window.location.href = "/map")}
              borderless
              rimless
              className="h-8 text-slate-900 dark:text-slate-100"
              buttonClassName="h-8 px-3 py-0 text-xs font-medium leading-none"
            >
              Map
            </GlassButton>
            <GlassButton
              type="button"
              onClick={() => (window.location.href = "/dashboard")}
              borderless
              rimless
              className="h-8 text-slate-900 dark:text-slate-100"
              buttonClassName="h-8 px-3 py-0 text-xs font-medium leading-none"
            >
              Dashboard
            </GlassButton>
          </div>
        </header>
      </Glass>

      <main className="mx-auto max-w-lg space-y-4 px-3 pb-6 pt-16">
        {/* Sector selector: which sector's CCTV we're surveilling */}
        <GlassCard glow className="gap-0 border-white/20 bg-white/[0.06] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-slate-400">Sector</span>
          <select
            value={selectedSector}
            onChange={(e) => setSelectedSector(e.target.value as SectorName)}
            className="rounded-lg border border-[#1E2D4A] bg-[#1A2540] px-3 py-2 text-sm font-medium text-slate-200 focus:border-cyan-500 focus:outline-none"
          >
            {SECTOR_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          </div>
        </GlassCard>

        {/* Camera / source image area */}
        <GlassCard glow className="gap-0 border-white/20 bg-white/[0.06] p-1 py-1">
          <div className="relative flex min-h-[280px] items-center justify-center overflow-hidden rounded-lg bg-[#0F1629]">
            {sourceImageDataUrl ? (
              <>
                <img
                  src={sourceImageDataUrl}
                  alt="Captured or uploaded"
                  className="h-full w-full object-contain"
                />
                {busy && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#0A0E1A]/70">
                    <Loader2 className="h-12 w-12 animate-spin text-slate-300" />
                  </div>
                )}
              </>
            ) : (
              <p className="text-center font-medium text-slate-500">Start camera to scan</p>
            )}
          </div>
        </GlassCard>

        {/* Buttons */}
        <div className="flex flex-col gap-3">
          <GlassButton
            type="button"
            onClick={handleWebcam}
            disabled={busy}
            className="w-full rounded-xl border-white/20"
            buttonClassName="w-full justify-center gap-2 py-3.5 text-sm font-medium text-slate-100 disabled:opacity-50"
          >
            <Camera className="h-5 w-5" />
            Start camera
          </GlassButton>
          <div className="relative">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleUploadChange}
              disabled={busy}
              className="absolute inset-0 cursor-pointer opacity-0 disabled:pointer-events-none"
            />
            <GlassButton
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="w-full rounded-xl border-white/20"
              buttonClassName="w-full justify-center gap-2 py-3.5 text-sm font-medium text-slate-100 disabled:opacity-50"
            >
              <Upload className="h-5 w-5" />
              Upload image
            </GlassButton>
          </div>
        </div>

        {status === "error" && errorMessage && (
          <p className="text-sm text-amber-400">{errorMessage}</p>
        )}

        {/* Result: count (clickable) + annotated image below */}
        {status === "done" && count !== null && (
          <div className="space-y-3 pt-2">
            <GlassCard glow className="gap-0 border-white/20 bg-white/[0.06] p-4 py-4 text-center">
              <Link to="/map" className="block">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">People detected</p>
                <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-slate-100">{count}</p>
                <p className="mt-1 text-xs text-slate-400">Tap to open map</p>
              </Link>
            </GlassCard>
            {annotatedImageB64 && (
              <GlassCard glow className="gap-0 overflow-hidden border-white/20 bg-white/[0.06] p-0 py-0">
                <p className="border-b border-[#1E2D4A] px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Result</p>
                <img
                  src={`data:image/jpeg;base64,${annotatedImageB64}`}
                  alt="Annotated detection result"
                  className="block w-full"
                />
              </GlassCard>
            )}
          </div>
        )}

        {/* Per-sector counts: North 45, East 60, West 50, South 32 — updates as you scan each sector */}
        <GlassCard glow className="gap-0 border-white/20 bg-white/[0.06] p-4 py-4">
          <Link to="/map" className="block">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">People by sector</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              {(["North", "East", "West", "South"] as const).map((name) => {
                const value = sectorCounts[name];
                return (
                  <span key={name} className="flex items-center gap-1.5 font-mono text-slate-200">
                    <span className="font-medium text-slate-400">{name}</span>
                    <span className="tabular-nums font-semibold">{value !== null ? value : "—"}</span>
                  </span>
                );
              })}
            </div>
            {hasAnySectorCount && (
              <div className="mt-3 flex items-baseline gap-2 text-xs text-slate-300">
                <span className="font-semibold uppercase tracking-wide">Overall total</span>
                <span className="font-mono text-base font-bold tabular-nums text-slate-100">
                  {totalAcrossSectors.toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-500">(tap to open map)</span>
              </div>
            )}
            <p className="mt-2 text-xs text-slate-500">Tap to view sectors on the live map.</p>
          </Link>
        </GlassCard>
      </main>
    </BackgroundGradientAnimation>
  );
}
