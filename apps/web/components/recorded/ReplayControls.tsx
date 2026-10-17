"use client";

import { useAircraftStore } from "../../store/aircraftStore";

const SPEEDS = [1, 10, 20];

const time = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", minute: "2-digit", second: "2-digit" });

/** Play, pause, speed and scrub (SPEC 12.5). */
export function ReplayControls({ title, onSeek }: { title: string; onSeek: (t: number) => void }) {
  const replay = useAircraftStore((s) => s.replay);
  const setControls = useAircraftStore((s) => s.setReplayControls);
  if (!replay) return null;
  const atEnd = replay.clock >= replay.end;

  return (
    <div className="absolute inset-x-3 bottom-11 z-10 mx-auto max-w-xl rounded-2xl border border-white/10 bg-navy/95 p-3 text-text shadow-2xl md:bottom-9">
      <div className="mb-2 flex items-center justify-between gap-2 text-sm">
        <span className="truncate font-medium">{title}</span>
        <span className="shrink-0 tabular-nums text-muted">{time.format(new Date(replay.clock * 1000))}</span>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (atEnd) onSeek(replay.start);
            setControls({ playing: atEnd ? true : !replay.playing });
          }}
          className="w-20 rounded-lg bg-sky px-3 py-1.5 text-sm font-medium text-navy hover:bg-sky/90"
        >
          {replay.playing ? "Pause" : atEnd ? "Replay" : "Play"}
        </button>
        <input
          type="range"
          aria-label="Replay position"
          min={replay.start}
          max={replay.end}
          step={1}
          value={replay.clock}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="flex-1 accent-sky"
        />
        <div role="group" aria-label="Replay speed" className="flex gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={replay.speed === s}
              onClick={() => setControls({ speed: s })}
              className={`rounded-md px-2 py-1 text-xs ${replay.speed === s ? "bg-sky/20 text-sky" : "text-muted hover:text-text"}`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
