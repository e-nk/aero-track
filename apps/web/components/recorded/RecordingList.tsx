"use client";

import type { RecordingMeta } from "@aerotrack/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDuration } from "@aerotrack/detectors";
import { OFFLINE } from "../../lib/config";
import { loadRecordingList } from "../../lib/recordings";

const when = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

export function RecordingList() {
  const [state, setState] = useState<{ source: "api" | "offline"; recordings: RecordingMeta[] } | null>(null);
  useEffect(() => {
    loadRecordingList().then(setState);
  }, []);

  return (
    <main className="min-h-dvh bg-navy px-4 py-8 text-text">
      <div className="mx-auto max-w-2xl">
        {OFFLINE ? (
          <p className="text-sm text-amber">Offline demo mode · live data needs an internet connection</p>
        ) : (
          <Link href="/" className="text-sm text-sky hover:underline">
            ← Back to live
          </Link>
        )}
        <h1 className="mt-4 text-2xl font-semibold">Recorded flights</h1>
        <p className="mt-1 text-sm text-muted">
          Real flights captured by AeroTrack. Replays run in your browser, the same way the live insights do.
        </p>
        {!state && <p className="mt-6 text-muted">Loading…</p>}
        {state && state.recordings.length === 0 && <p className="mt-6">No recordings yet.</p>}
        <ul className="mt-6 space-y-3">
          {state?.recordings.map((r) => (
            <li key={r.id}>
              <Link href={`/recorded/${r.id}`} className="block rounded-xl border border-white/10 bg-white/[0.03] p-4 hover:bg-white/[0.06]">
                <span className="block font-medium">{r.title}</span>
                <span className="mt-1 block text-sm text-muted">
                  {when.format(new Date(r.capturedFrom * 1000))} · {formatDuration(r.capturedTo - r.capturedFrom)} ·{" "}
                  {r.aircraftCount} aircraft · {r.attribution}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {state?.source === "offline" && !OFFLINE && (
          <p className="mt-6 text-xs text-muted">Showing recordings saved on this device (the live server isn&apos;t reachable).</p>
        )}
      </div>
    </main>
  );
}
