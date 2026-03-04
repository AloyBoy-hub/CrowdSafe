import { useEffect, useRef, useState } from "react";
import { WS_URL } from "../../lib/api";

const MOBILE_LOCATION = "National Stadium";
const MOBILE_SECTOR = "North";
const MOBILE_NEAREST_EXIT = "North Exit";

const MAP_EXTENSIONS = ["png", "jpg", "jpeg"] as const;

interface RedirectNotification {
  exitId: string;
  exitName: string;
}

export default function MobilePage() {
  const [mapSrc, setMapSrc] = useState<string>("/static/map.jpg");
  const [redirectPopup, setRedirectPopup] = useState<RedirectNotification | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Try map image extensions in order
  const handleMapError = () => {
    const currentExt = mapSrc.split(".").pop()?.toLowerCase();
    const idx = MAP_EXTENSIONS.indexOf((currentExt as (typeof MAP_EXTENSIONS)[number]) ?? "png");
    const next = MAP_EXTENSIONS[idx + 1];
    if (next) setMapSrc(`/static/map.${next}`);
  };

  // WebSocket: listen for redirect notifications from dashboard
  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as { type?: string; exitId?: string; exitName?: string };
        if (data?.type === "redirect" && data.exitId) {
          setRedirectPopup({
            exitId: data.exitId,
            exitName: data.exitName ?? data.exitId
          });
        }
      } catch {
        // ignore non-JSON or frame payloads
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, []);

  return (
    <div className="min-h-full bg-[#0F1629] text-slate-100">
      <div className="mx-auto max-w-md px-4 pb-8 pt-6">
        <h1 className="mb-6 text-lg font-semibold uppercase tracking-wider text-cyan-400">
          CrowdSafe
        </h1>

        <section className="mb-6 rounded-xl border border-[#1E2D4A] bg-[#162040] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Location
          </p>
          <p className="mt-1 text-base font-medium text-slate-200">{MOBILE_LOCATION}</p>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Current sector
          </p>
          <p className="mt-1 text-base font-medium text-slate-200">{MOBILE_SECTOR}</p>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Nearest exit
          </p>
          <p className="mt-1 text-base font-medium text-slate-200">{MOBILE_NEAREST_EXIT}</p>
        </section>

        <section className="rounded-xl border border-[#1E2D4A] bg-[#162040] p-2">
          <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Indoor map
          </p>
          <img
            src={mapSrc}
            alt="Indoor map"
            className="w-full rounded-lg object-contain"
            onError={handleMapError}
          />
        </section>
      </div>

      {/* Redirect notification popup */}
      {redirectPopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="redirect-title"
        >
          <div className="w-full max-w-sm rounded-xl border-2 border-amber-500/80 bg-[#0F1629] p-5 shadow-xl">
            <h2 id="redirect-title" className="text-base font-bold uppercase tracking-wider text-amber-400">
              Evacuation update
            </h2>
            <p className="mt-3 text-slate-200">
              You have been redirected to exit:{" "}
              <strong className="text-cyan-300">{redirectPopup.exitName}</strong>
            </p>
            <button
              type="button"
              onClick={() => setRedirectPopup(null)}
              className="mt-5 w-full rounded-lg bg-cyan-600 px-4 py-3 font-semibold text-white hover:bg-cyan-500"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
