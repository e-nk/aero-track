import { EventLifecycle } from "@aerotrack/detectors";
import { THRESHOLDS } from "@aerotrack/shared";
import { describe, expect, it } from "vitest";
import { AircraftStore } from "../src/buffer";
import { createEventEngine } from "../src/eventEngine";
import { createPipeline } from "../src/pipeline";
import { parseResponse } from "../src/providers/adsblol/schema";
import { createWriter } from "../src/writer";
import { FakeRepo } from "./fakeRepo";
import { loadSample } from "./providers/adsblol/sample";

const silent = { warn: () => {}, error: () => {} };

function setup() {
  const repo = new FakeRepo();
  const store = new AircraftStore(THRESHOLDS);
  const lifecycle = new EventLifecycle({ thresholds: THRESHOLDS, mode: "live", newId: () => crypto.randomUUID() });
  const engine = createEventEngine({ store, lifecycle, thresholds: THRESHOLDS });
  const writer = createWriter(repo, THRESHOLDS.writer, silent);
  return { repo, store, writer, pipeline: createPipeline({ store, engine, writer }) };
}

describe("poll pipeline", () => {
  it("adapts, stores and queues one real response", async () => {
    const { repo, store, writer, pipeline } = setup();
    const result = pipeline.handle(parseResponse(loadSample()));
    await writer.flush();

    expect(result).toMatchObject({ now: 1792219219.5, aircraftCount: 19, newPositions: 19 });
    expect(store.all()).toHaveLength(19);
    expect(repo.positions).toHaveLength(19);
    expect(repo.positions.every((p) => p.mode === "live")).toBe(true);
    expect(repo.aircraft.size).toBe(19);
  });

  it("queues only positions that are new", async () => {
    const { repo, writer, pipeline } = setup();
    const parsed = parseResponse(loadSample());
    pipeline.handle(parsed);
    const again = pipeline.handle(parsed);
    await writer.flush();
    expect(again.newPositions).toBe(0);
    expect(repo.positions).toHaveLength(19);
  });

  it("uses the provider's clock, not the server's", () => {
    const { pipeline } = setup();
    const sample = loadSample();
    sample.now = sample.now + 120_000; // two minutes later, no fresh positions
    for (const ac of sample.ac) ac.seen_pos = Number(ac.seen_pos) + 120;
    const result = pipeline.handle(parseResponse(sample));
    // Every position is now over 60 s old at the provider's "now".
    expect(result.changes.opened.length).toBe(19);
    expect(result.changes.opened.every((e) => e.type === "signal_lost")).toBe(true);
  });

  it("queues event changes for the database", async () => {
    const { repo, writer, pipeline } = setup();
    const sample = loadSample();
    sample.now = sample.now + 120_000;
    for (const ac of sample.ac) ac.seen_pos = Number(ac.seen_pos) + 120;
    pipeline.handle(parseResponse(sample));
    await writer.flush();
    expect(repo.events.size).toBe(19);
  });
});
