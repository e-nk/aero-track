"use client";

import { useEffect } from "react";
import { useAircraftStore } from "../store/aircraftStore";
import { fetchDetail, fetchTrack } from "./api";

/**
 * While an aircraft is selected, load its details and track, and refresh them
 * after every live snapshot. Seeds open events the stream hasn't sent us.
 */
export function useSelectedAircraft(): void {
  const hex = useAircraftStore((s) => s.selectedHex);
  const lastSnapshotAt = useAircraftStore((s) => s.lastSnapshotAt);

  useEffect(() => {
    if (!hex) return;
    const ctrl = new AbortController();
    const { setSelection, seedEvents, aircraft, overview, mode } = useAircraftStore.getState();
    if (mode === "recorded") return; // the replay supplies details and track (SPEC 12.5)
    // Overview-only aircraft have no history or events on the server (SPEC 11.10).
    if (!aircraft[hex] && overview?.aircraft[hex]) {
      setSelection(hex, { status: "ready", detail: null, segments: [] });
      return;
    }

    Promise.all([fetchDetail(hex, ctrl.signal), fetchTrack(hex, ctrl.signal)])
      .then(([detail, segments]) => {
        if (detail === "not_found") return setSelection(hex, { status: "not_found", segments: [] });
        seedEvents(detail);
        setSelection(hex, { status: "ready", detail, segments });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        // Keep what we already show; only flag the error.
        console.warn("Could not refresh aircraft details", err);
        setSelection(hex, { status: "error" });
      });

    return () => ctrl.abort();
  }, [hex, lastSnapshotAt]);
}
