import type { RecordingFile } from "@aerotrack/shared";

// "Later reported as" (SPEC 8): a published source's account, kept apart from what the data shows.
export function ReportedCause({ cause }: { cause: NonNullable<RecordingFile["reportedCause"]> }) {
  return (
    <details
      open
      className="absolute left-14 z-10 max-w-sm rounded-xl border border-white/10 bg-navy/90 text-sm text-text shadow-lg"
      style={{ top: "calc(1.25rem + var(--header-h, 2.25rem))" }}
    >
      <summary className="cursor-pointer px-3 py-2 font-medium">Later reported as</summary>
      <div className="px-3 pb-3">
        <p>{cause.text}</p>
        <p className="mt-2">
          Source:{" "}
          <a href={cause.sourceUrl} target="_blank" rel="noopener" className="text-sky hover:underline">
            {cause.sourceName}
          </a>
        </p>
        <p className="mt-1 text-xs text-muted">From a published report, not from the flight data. AeroTrack&apos;s insights only describe what the data shows.</p>
      </div>
    </details>
  );
}
