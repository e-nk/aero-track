import { describe, expect, it } from "vitest";
import { detectEmergency } from "../src/emergency";
import { ctxFor, fly } from "./fixtures/build";

const track = fly([{ sec: 70 }]);
const run = (squawk: string | null, emergency: string | null) => detectEmergency(track, ctxFor(track, { squawk, emergency }));

describe("detectEmergency", () => {
  it("squawk 7700 → emergency, a fact", () => {
    expect(run("7700", null)).toMatchObject({ type: "emergency", confidence: "fact", evidence: { squawk: "7700" } });
    expect(run("7700", null)!.evidence.emergency).toBeUndefined();
  });

  it("an emergency status other than none → emergency", () => {
    expect(run("1200", "general")!.evidence).toEqual({ squawk: "1200", emergency: "general" });
    expect(run(null, "minfuel")!.evidence).toEqual({ emergency: "minfuel" });
  });

  it("nothing for normal codes or 'none'", () => {
    expect(run("1000", "none")).toBeNull();
    expect(run(null, null)).toBeNull();
  });
});
