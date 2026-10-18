"use client";

import { THRESHOLDS } from "@aerotrack/shared";
import { useEffect, useState } from "react";
import type { Alert } from "../../lib/alerts";
import { showNotification } from "../../lib/notify";
import { useAircraftStore } from "../../store/aircraftStore";

/** New alerts as toasts (top right) and, when allowed, system notifications. */
export function AlertToasts() {
  const [toasts, setToasts] = useState<Alert[]>([]);
  const focusOn = useAircraftStore((s) => s.focusOn);

  useEffect(
    () =>
      useAircraftStore.subscribe((s, prev) => {
        if (s.alerts === prev.alerts) return;
        const known = new Set(prev.alerts.map((a) => a.id));
        const fresh = s.alerts.filter((a) => !known.has(a.id));
        if (!fresh.length) {
          if (!s.alerts.length) setToasts([]); // mode switch or seek back cleared the list
          return;
        }
        for (const a of fresh) {
          showNotification(a, () => useAircraftStore.getState().focusOn(a.hex));
          setTimeout(() => setToasts((t) => t.filter((x) => x.id !== a.id)), THRESHOLDS.alerts.toastMs);
        }
        setToasts((t) => [...fresh, ...t].slice(0, THRESHOLDS.alerts.maxToasts));
      }),
    [],
  );

  if (!toasts.length) return null;
  return (
    <div aria-live="polite" className="pointer-events-none absolute right-3 top-3 z-30 flex w-80 max-w-[calc(100vw-1.5rem)] flex-col gap-2">
      {toasts.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => focusOn(a.hex)}
          className="pointer-events-auto rounded-xl border border-sky/30 bg-navy/95 p-3 text-left text-sm text-text shadow-lg hover:bg-white/5"
        >
          <span className="flex items-center justify-between gap-2">
            <span className="font-medium">🔔 {a.title}</span>
            {a.mode !== "live" && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">Recorded</span>}
          </span>
          <span className="mt-1 block text-text/85">{a.body}</span>
        </button>
      ))}
    </div>
  );
}
