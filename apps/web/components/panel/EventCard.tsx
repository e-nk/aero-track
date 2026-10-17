import { describeEvidence } from "@aerotrack/detectors";
import type { BehaviourEvent } from "@aerotrack/shared";
import { CARD_LABELS, eventTitle } from "../../lib/eventCopy";

/** Three-part event card with a "How we know" expander (SPEC 10). */
export function EventCard({ event }: { event: BehaviourEvent }) {
  const evidence = describeEvidence(event);
  const possible = event.confidence === "possible";

  return (
    <article className={`rounded-xl border p-4 ${possible ? "border-amber/40" : "border-white/10"} bg-white/[0.03]`}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-text">{eventTitle(event.type)}</h3>
        {possible && <span className="rounded-full bg-amber/15 px-2 py-0.5 text-xs font-medium text-amber">Possible</span>}
      </header>

      <dl className="space-y-3 text-sm leading-relaxed">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">{CARD_LABELS.seen}</dt>
          <dd className="text-text">{event.explanation.seen}</dd>
        </div>
        {event.explanation.commonly && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">{CARD_LABELS.commonly}</dt>
            <dd className="text-text/90">{event.explanation.commonly}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">{CARD_LABELS.cannotTell}</dt>
          <dd className="text-text/90">{event.explanation.cannotTell}</dd>
        </div>
      </dl>

      {evidence.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer select-none text-sky hover:underline">{CARD_LABELS.howWeKnow}</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-text/85">
            {evidence.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
