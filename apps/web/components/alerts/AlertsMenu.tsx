"use client";

import { DISPLAY_TIME_ZONE } from "@aerotrack/shared";
import { useState } from "react";
import { useAircraftStore } from "../../store/aircraftStore";

const time = new Intl.DateTimeFormat("en-AU", { timeZone: DISPLAY_TIME_ZONE, hour: "numeric", minute: "2-digit" });

/** Bell with unread count, and this visit's alerts. */
export function AlertsMenu() {
  const alerts = useAircraftStore((s) => s.alerts);
  const unread = useAircraftStore((s) => s.unreadAlerts);
  const markAlertsRead = useAircraftStore((s) => s.markAlertsRead);
  const focusOn = useAircraftStore((s) => s.focusOn);
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          markAlertsRead();
        }}
        aria-expanded={open}
        aria-label={unread ? `Alerts, ${unread} new` : "Alerts"}
        className="rounded-full bg-navy/90 px-3 py-1.5 text-sm text-text shadow-lg hover:bg-white/5"
      >
        🔔{unread > 0 && <span className="ml-1 rounded-full bg-sky px-1.5 text-xs font-semibold text-navy">{unread}</span>}
      </button>
      {open && (
        <div className="fixed inset-x-3 top-16 z-30 rounded-xl sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-1 sm:w-80 border border-white/10 bg-navy p-2 sm:bg-navy/95 text-sm text-text shadow-lg">
          {alerts.length === 0 ? (
            <p className="px-2 py-2 text-muted">No alerts yet. Watch a flight to get them here.</p>
          ) : (
            <ol className="max-h-80 overflow-y-auto">
              {alerts.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => focusOn(a.hex)} className="block w-full rounded-lg px-2 py-2 text-left hover:bg-white/5">
                    <span className="flex justify-between gap-2">
                      <span className="font-medium">
                        {a.title}
                        {a.mode !== "live" && <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 align-middle text-[10px] uppercase tracking-wide text-muted">Recorded</span>}
                      </span>
                      <span className="shrink-0 text-xs text-muted">{time.format(new Date(a.at * 1000))}</span>
                    </span>
                    <span className="block text-xs text-text/80">{a.body}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-1 border-t border-white/10 px-2 pt-2 text-xs text-muted">
            AeroTrack is informational only. Alerts work while AeroTrack is open. For official flight status, contact the airline.
          </p>
        </div>
      )}
    </div>
  );
}
