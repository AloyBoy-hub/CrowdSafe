import { useRef } from "react";
import type { ConnectionState } from "../../hooks/useSimulation";
import { useMapbox } from "../../hooks/useMapbox";
import { useSimStore } from "../../store/useSimStore";

interface MapViewProps {
  connectionState: ConnectionState;
}

export default function MapView({ connectionState }: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  useMapbox(mapContainerRef);

  const agentCount = useSimStore((state) => state.agents.length);
  const exitCount = useSimStore((state) => state.exits.length);
  const hazardCount = useSimStore((state) => state.hazards.length);
  const frame = useSimStore((state) => state.frame);

  return (
    <section className="relative h-full w-full overflow-hidden">
      <div ref={mapContainerRef} className="h-full w-full" />
      <aside className="ui-card absolute left-3 right-3 top-3 max-w-sm p-4 text-sm sm:left-4 sm:right-auto sm:top-4 md:left-6 md:top-6 lg:left-8 lg:top-8 xl:left-10 xl:top-10">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Live Simulation Feed</h2>
        <dl className="mt-3 space-y-1 text-slate-700 dark:text-slate-300">
          <div className="flex justify-between gap-4">
            <dt>Connection</dt>
            <dd className="font-medium capitalize">{connectionState}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Frame</dt>
            <dd className="font-medium">{frame}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Agents</dt>
            <dd className="font-medium">{agentCount}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Exits</dt>
            <dd className="font-medium">{exitCount}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Hazards</dt>
            <dd className="font-medium">{hazardCount}</dd>
          </div>
        </dl>
      </aside>
    </section>
  );
}
