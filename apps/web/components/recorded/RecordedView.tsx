"use client";

import { useHeaderHeight } from "../../lib/useHeaderHeight";
import { preprocess } from "@aerotrack/detectors";
import { THRESHOLDS, type AircraftState, type RecordingFile } from "@aerotrack/shared";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { OFFLINE } from "../../lib/config";
import { loadRecording } from "../../lib/recordings";
import { ReplayEngine } from "../../lib/replay/engine";
import { useAircraftStore } from "../../store/aircraftStore";
import { ReportedCause } from "./ReportedCause";
import { FilterBar } from "../filters/FilterBar";
import { ModeBadge } from "../ModeBadge";
import { DetailsPanel } from "../panel/DetailsPanel";
import { ReplayControls } from "./ReplayControls";

const AircraftMap = dynamic(() => import("../map/AircraftMap"), { ssr: false });

const TICK_MS = 100; // real time between replay steps (and store updates)

/** Recorded flight replay (SPEC 12.5). Runs the detectors in the browser; works with no network. */
export function RecordedView({ id }: { id: string }) {
  const headerRef = useHeaderHeight<HTMLElement>();
  const [recording, setRecording] = useState<RecordingFile | null | "missing">(null);
  const engineRef = useRef<ReplayEngine | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadRecording(id).then((rec) => !cancelled && setRecording(rec ?? "missing"));
    return () => {
      cancelled = true;
      useAircraftStore.getState().reset(); // leaving replay clears the store (SPEC 12.1)
    };
  }, [id]);

  // Start the engine and the replay clock once the recording is loaded.
  useEffect(() => {
    if (!recording || recording === "missing") return;
    const engine = new ReplayEngine(recording, THRESHOLDS);
    engineRef.current = engine;
    const store = useAircraftStore.getState();
    store.startRecorded({
      id: recording.id,
      title: recording.title,
      start: engine.start,
      end: engine.end,
      clock: engine.start,
      speed: 10,
      playing: true,
      attribution: recording.attribution,
      reportedCause: recording.reportedCause,
      mode: recording.mode,
    });

    const push = () => {
      const { setReplayFrame, selectedHex, setSelection } = useAircraftStore.getState();
      setReplayFrame(engine.clock, engine.aircraft(Date.now()), engine.openEvents());
      if (selectedHex) setSelection(selectedHex, replaySelection(engine, selectedHex));
    };
    push();

    const timer = setInterval(() => {
      const { replay, setReplayControls } = useAircraftStore.getState();
      if (replay?.playing) {
        engine.advanceTo(engine.clock + (TICK_MS / 1000) * replay.speed);
        if (engine.clock >= engine.end) setReplayControls({ playing: false });
      }
      // Push even while paused: positions are dead-reckoned from receipt time, so
      // refreshing it keeps paused aircraft (and "last position") still.
      push();
    }, TICK_MS);

    // Scrubbing and selection changes while paused still need a fresh frame.
    const unsubscribe = useAircraftStore.subscribe((s, prev) => {
      if (s.selectedHex !== prev.selectedHex && s.selectedHex) push();
    });
    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, [recording]);

  const seek = (t: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.seek(t);
    const { setReplayFrame } = useAircraftStore.getState();
    setReplayFrame(engine.clock, engine.aircraft(Date.now()), engine.openEvents());
  };

  if (recording === "missing") {
    return (
      <main className="flex h-dvh flex-col items-center justify-center gap-4 bg-navy p-6 text-center text-text">
        <p>We couldn&apos;t find that recording.</p>
        <Link href="/recorded" className="text-sky hover:underline">
          See all recorded flights
        </Link>
      </main>
    );
  }

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-navy">
      {recording && <AircraftMap initialBounds={recording.bbox} />}
      <header ref={headerRef} className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2">
        <span className="pointer-events-auto rounded-full bg-navy/90 px-3 py-1.5 text-sm font-semibold text-text shadow-lg">
          AeroTrack
        </span>
        <div className="pointer-events-auto">
          <ModeBadge />
        </div>
        <Link
          href={OFFLINE ? "/recorded" : "/"}
          className="pointer-events-auto rounded-full border border-white/10 bg-navy/90 px-3 py-1.5 text-sm text-sky shadow-lg hover:bg-white/5"
        >
          {OFFLINE ? "All recordings" : "Back to live"}
        </Link>
        <div className="pointer-events-auto">
          <FilterBar />
        </div>
      </header>
      {!recording && <p className="absolute inset-0 flex items-center justify-center text-muted">Loading recording…</p>}
      {recording && <ReplayControls title={recording.title} onSeek={seek} />}
      {recording?.reportedCause && <ReportedCause cause={recording.reportedCause} />}
      <DetailsPanel />
    </main>
  );
}

/** Panel details for a replayed aircraft, from the recording only (never the api). */
function replaySelection(engine: ReplayEngine, hex: string) {
  const identity = engine.identity(hex);
  const track = engine.track(hex);
  const last = track.at(-1);
  if (!identity || !last) return { status: "not_found" as const, detail: null, segments: [] };
  const state: AircraftState = {
    ...identity,
    typeDesc: null,
    squawk: null,
    emergency: null,
    altGeomFt: null,
    last,
    lastPosTs: last.t,
    mode: "recorded",
  };
  const pre = preprocess(track, THRESHOLDS);
  return {
    status: "ready" as const,
    detail: { state, history: pre.status, openEvents: engine.openEvents().filter((e) => e.hex === hex), recentEvents: engine.recentEvents(hex) },
    segments: pre.segments,
  };
}
