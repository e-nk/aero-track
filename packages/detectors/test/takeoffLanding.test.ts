import { describe, expect, it } from "vitest";
import { detectTakeoffLanding } from "../src/takeoffLanding";
import { ctxFor, fly } from "./fixtures/build";

const YSSY = { lat: -33.946098, lon: 151.177002 };
const run = (track: ReturnType<typeof fly>) => detectTakeoffLanding(track, ctxFor(track));

/** Ground roll at Sydney Airport, then airborne legs. */
const departure = (airborne: Parameters<typeof fly>[0], start = YSSY) =>
  fly([{ sec: 42, onGround: true }, ...airborne], { ...start, altFt: 0, onGround: true, gsKt: 150 });

describe("detectTakeoffLanding: take-off", () => {
  it("detects a take-off near Sydney Airport", () => {
    const track = departure([{ sec: 42, climbFpm: 2000 }]);
    const firstAirborne = track.find((o) => !o.onGround)!;
    const [takeoff] = run(track);
    expect(takeoff).toMatchObject({
      type: "takeoff",
      confidence: "observed",
      windowStart: firstAirborne.t,
      evidence: { at: firstAirborne.t, airport: "YSSY", airportName: "Sydney Kingsford Smith International Airport" },
    });
    expect(Number(takeoff!.evidence.airportKm)).toBeLessThan(5);
  });

  it("says no airport when it happens away from known airports", () => {
    const [takeoff] = run(departure([{ sec: 42, climbFpm: 2000 }], { lat: -33.45, lon: 150.6 }));
    expect(takeoff!.type).toBe("takeoff");
    expect(takeoff!.evidence.airport).toBeUndefined();
  });

  it("ignores a single airborne report between ground reports", () => {
    const track = fly([{ sec: 70, onGround: true }], { ...YSSY, altFt: 0, onGround: true, gsKt: 20 }).map((o, i) =>
      i === 5 ? { ...o, onGround: false, altFt: 50 } : o,
    );
    expect(run(track)).toEqual([]);
  });

  it("ignores a single bogus ground report from a climbing aircraft", () => {
    const track = fly([{ sec: 120, climbFpm: 1500 }], { altFt: 8000 }).map((o, i) => (i === 6 ? { ...o, onGround: true } : o));
    expect(run(track).filter((d) => d.type === "takeoff")).toEqual([]);
  });

  it("needs minClimbFt of climb after leaving the ground", () => {
    // 3 airborne reports at 500 fpm = 175 ft.
    expect(run(departure([{ sec: 21, climbFpm: 500 }]))).toEqual([]);
  });

  it("does not count a change that straddles a gap", () => {
    const ground = fly([{ sec: 42, onGround: true }], { ...YSSY, altFt: 0, onGround: true, gsKt: 20 });
    const air = fly([{ sec: 42, climbFpm: 2000 }], { ...YSSY, t: ground.at(-1)!.t + 300, altFt: 1500 });
    expect(run([...ground, ...air])).toEqual([]);
  });
});

describe("detectTakeoffLanding: landing", () => {
  const arrival = (groundSec: number, startAlt = 1500) =>
    fly([{ sec: 63, climbFpm: -1000 }, { sec: groundSec, onGround: true }], {
      lat: YSSY.lat,
      lon: YSSY.lon - 0.05,
      altFt: startAlt,
      gsKt: 140,
    });

  it("detects a landing near Sydney Airport", () => {
    const track = arrival(42);
    const firstGround = track.find((o) => o.onGround)!;
    const [landing] = run(track);
    expect(landing).toMatchObject({ type: "landing", confidence: "observed", evidence: { at: firstGround.t, airport: "YSSY" } });
  });

  it("needs confirmObs ground reports", () => {
    expect(run(arrival(14))).toEqual([]);
  });

  it("ignores a ground report from high altitude", () => {
    expect(run(arrival(42, 12000))).toEqual([]);
  });
});

describe("detectTakeoffLanding: several transitions", () => {
  it("reports the most recent take-off and the most recent landing", () => {
    const first = departure([{ sec: 42, climbFpm: 2000 }]);
    const landed = fly([{ sec: 63, climbFpm: -1000 }, { sec: 42, onGround: true }], {
      ...YSSY,
      t: first.at(-1)!.t + 7,
      altFt: first.at(-1)!.altFt!,
      gsKt: 140,
    });
    const again = departure([{ sec: 42, climbFpm: 2000 }]).map((o, i) => ({ ...o, t: landed.at(-1)!.t + 7 * (i + 1) }));
    const types = run([...first, ...landed, ...again]);
    expect(types.map((d) => d.type).sort()).toEqual(["landing", "takeoff"]);
    const takeoff = types.find((d) => d.type === "takeoff")!;
    expect(takeoff.evidence.at).toBe(again.find((o) => !o.onGround)!.t);
  });
});

describe("detectTakeoffLanding: airport list from the context", () => {
  it("uses ctx.airports when given, e.g. the server's worldwide list", () => {
    const LAX = { ident: "KLAX", name: "Los Angeles International Airport", lat: 33.942501, lon: -118.407997, elevationFt: 125 };
    const track = fly([{ sec: 42, onGround: true }, { sec: 42, climbFpm: 2000 }], {
      lat: LAX.lat,
      lon: LAX.lon,
      altFt: 0,
      onGround: true,
      gsKt: 150,
    });
    const [takeoff] = detectTakeoffLanding(track, ctxFor(track, { airports: [LAX] }));
    expect(takeoff!.evidence).toMatchObject({ airport: "KLAX", airportName: "Los Angeles International Airport" });
    // Without it, only the Sydney-region list is known.
    expect(detectTakeoffLanding(track, ctxFor(track))[0]!.evidence.airport).toBeUndefined();
  });
});

