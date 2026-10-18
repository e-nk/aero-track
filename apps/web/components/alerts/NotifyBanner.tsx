"use client";

import { useState } from "react";
import { notificationPermission, requestNotifications } from "../../lib/notify";
import { useAircraftStore } from "../../store/aircraftStore";

/** One calm offer to turn on system notifications, after the first watch. */
export function NotifyBanner() {
  const watchingAny = useAircraftStore((s) => s.watched.length + s.replayWatch.length > 0);
  const [dismissed, setDismissed] = useState(false);
  const [permission, setPermission] = useState<string | null>(null);
  const current = permission ?? (watchingAny ? notificationPermission() : "unsupported");
  if (!watchingAny || dismissed || current !== "default") return null;

  return (
    <div role="dialog" aria-label="Notifications" className="absolute bottom-24 left-1/2 z-30 w-[min(28rem,calc(100vw-1.5rem))] -translate-x-1/2 rounded-xl border border-sky/30 bg-navy/95 p-3 text-sm text-text shadow-lg">
      <p>Get a notification when something changes, even if AeroTrack is in another tab?</p>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={async () => setPermission(await requestNotifications())} className="rounded-lg bg-sky px-3 py-1.5 font-medium text-navy hover:bg-sky/90">
          Turn on
        </button>
        <button type="button" onClick={() => setDismissed(true)} className="rounded-lg px-3 py-1.5 text-sky hover:bg-white/5">
          Not now
        </button>
      </div>
    </div>
  );
}
