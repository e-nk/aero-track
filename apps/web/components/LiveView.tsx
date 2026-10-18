"use client";

import { useHeaderHeight } from "../lib/useHeaderHeight";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect } from "react";
import { API_URL } from "../lib/config";
import { connectLive } from "../lib/sse";
import { useSelectedAircraft } from "../lib/useSelectedAircraft";
import { useAircraftStore } from "../store/aircraftStore";
import { AlertToasts } from "./alerts/AlertToasts";
import { AlertsMenu } from "./alerts/AlertsMenu";
import { NotifyBanner } from "./alerts/NotifyBanner";
import { ModeBadge } from "./ModeBadge";
import { FilterBar } from "./filters/FilterBar";
import { FollowingList } from "./follow/FollowingList";
import { SearchBox } from "./search/SearchBox";
import { DetailsPanel } from "./panel/DetailsPanel";

// MapLibre needs the browser (WebGL), so skip server rendering for the map.
const AircraftMap = dynamic(() => import("./map/AircraftMap"), { ssr: false });

export function LiveView() {
  useSelectedAircraft();
  const headerRef = useHeaderHeight<HTMLElement>();
  const feedDown = useAircraftStore((s) => s.feedStatus === "down" || s.connection === "reconnecting");

  useEffect(() => {
    const { handlers, reset } = useAircraftStore.getState();
    const disconnect = connectLive(`${API_URL}/api/stream`, handlers);
    return () => {
      disconnect();
      reset();
    };
  }, []);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-navy">
      <AircraftMap />
      <header ref={headerRef} className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2">
        <span className="pointer-events-auto rounded-full bg-navy/90 px-3 py-1.5 text-sm font-semibold text-text shadow-lg">
          AeroTrack
        </span>
        <div className="pointer-events-auto">
          <ModeBadge />
        </div>
        <div className="pointer-events-auto">
          <AlertsMenu />
        </div>
        <Link
          href="/recorded"
          className="pointer-events-auto rounded-full border border-white/10 bg-navy/90 px-3 py-1.5 text-sm text-sky shadow-lg hover:bg-white/5"
        >
          {feedDown ? "Watch a recorded flight" : "Recorded flights"}
        </Link>
        <div className="pointer-events-auto">
          <SearchBox />
        </div>
        <div className="pointer-events-auto">
          <FilterBar />
        </div>
        <div className="pointer-events-auto basis-full">
          <FollowingList />
        </div>
      </header>
      <AlertToasts />
      <NotifyBanner />
      <DetailsPanel />
    </main>
  );
}
