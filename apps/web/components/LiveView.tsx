"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { API_URL } from "../lib/config";
import { connectLive } from "../lib/sse";
import { useSelectedAircraft } from "../lib/useSelectedAircraft";
import { useAircraftStore } from "../store/aircraftStore";
import { ModeBadge } from "./ModeBadge";
import { FollowingList } from "./follow/FollowingList";
import { DetailsPanel } from "./panel/DetailsPanel";

// MapLibre needs the browser (WebGL), so skip server rendering for the map.
const AircraftMap = dynamic(() => import("./map/AircraftMap"), { ssr: false });

export function LiveView() {
  useSelectedAircraft();
  const hasFollows = useAircraftStore((s) => (s.follows?.follows.length ?? 0) > 0);

  useEffect(() => {
    const { handlers, reset } = useAircraftStore.getState();
    const disconnect = connectLive(`${API_URL}/api/stream`, handlers);
    return () => {
      disconnect();
      reset();
    };
  }, []);

  return (
    <main className={`relative h-dvh w-full overflow-hidden bg-navy ${hasFollows ? "has-follows" : ""}`}>
      <AircraftMap />
      <header className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2">
        <span className="pointer-events-auto rounded-full bg-navy/90 px-3 py-1.5 text-sm font-semibold text-text shadow-lg">
          AeroTrack
        </span>
        <div className="pointer-events-auto">
          <ModeBadge />
        </div>
        <div className="pointer-events-auto basis-full">
          <FollowingList />
        </div>
      </header>
      <DetailsPanel />
    </main>
  );
}
