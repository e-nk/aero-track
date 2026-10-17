import { describe, expect, it } from "vitest";
import { parseResponse } from "../../../src/providers/adsblol/schema";
import { loadSample } from "./sample";

describe("parseResponse", () => {
  it("parses the saved real response", () => {
    const sample = loadSample();
    const parsed = parseResponse(sample);
    expect(parsed.now).toBe(1792219219500);
    expect(parsed.aircraft).toHaveLength(25);
    expect(parsed.rejected).toBe(0);
  });

  it("keeps unknown fields instead of failing on them", () => {
    const sample = loadSample();
    sample.brandNewEnvelopeField = 1;
    sample.ac[0]!.brand_new_field = "x";
    const parsed = parseResponse(sample);
    expect(parsed.aircraft).toHaveLength(25);
  });

  it("skips a malformed aircraft without dropping the rest", () => {
    const sample = loadSample();
    sample.ac[3] = { hex: "7c0000", alt_baro: "climbing" };
    sample.ac[4] = { flight: "NOHEX" };
    const parsed = parseResponse(sample);
    expect(parsed.aircraft).toHaveLength(23);
    expect(parsed.rejected).toBe(2);
  });

  it("rejects an envelope without now", () => {
    const { now: _now, ...rest } = loadSample();
    expect(() => parseResponse(rest)).toThrow();
  });

  it("rejects an envelope without ac", () => {
    expect(() => parseResponse({ now: 1, msg: "No error" })).toThrow();
  });
});
