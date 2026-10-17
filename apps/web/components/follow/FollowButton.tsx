"use client";

import { useState } from "react";
import { followFlight, unfollowFlight } from "../../lib/api";
import { useAircraftStore } from "../../store/aircraftStore";

/** Follow a flight worldwide (SPEC 11.11). The list is shared and capped, so it can say "full". */
export function FollowButton({ hex }: { hex: string }) {
  const following = useAircraftStore((s) => !!s.follows?.follows.some((f) => f.hex === hex));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setMessage(null);
    const result = following ? await unfollowFlight(hex) : await followFlight(hex);
    setBusy(false);
    if (!result.ok) setMessage(result.message);
    // On success the server broadcasts the new list; the store updates from the stream.
  }

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={following}
        className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-60 ${
          following ? "border border-sky/50 text-sky hover:bg-sky/10" : "bg-sky text-navy hover:bg-sky/90"
        }`}
      >
        {busy ? "One moment…" : following ? "Following · Stop following" : "Follow this flight"}
      </button>
      {message && <p className="mt-2 text-sm text-text/90">{message}</p>}
    </div>
  );
}
