import { describe, expect, it } from "vitest";
import { iconClass } from "../lib/iconClass";

describe("iconClass", () => {
  it.each([
    ["B738", "narrowbody"],
    ["A320", "narrowbody"],
    ["A21N", "narrowbody"],
    ["B38M", "narrowbody"],
    ["E190", "narrowbody"],
    ["B77W", "widebody"],
    ["A359", "widebody"],
    ["A333", "widebody"],
    ["B789", "widebody"],
    ["A388", "widebody"],
    ["DH8D", "turboprop"],
    ["AT76", "turboprop"],
    ["SF34", "turboprop"],
    ["BE20", "turboprop"],
    ["B350", "turboprop"],
    ["C172", "light"],
    ["P28A", "light"],
    ["DA40", "light"],
    ["SR22", "light"],
    ["R44", "helicopter"],
    ["EC35", "helicopter"],
    ["AS50", "helicopter"],
  ])("type %s → %s", (type, cls) => {
    expect(iconClass({ typeCode: type, category: null })).toBe(cls);
  });

  it("uses the emitter category when the type is unknown", () => {
    expect(iconClass({ typeCode: null, category: "A7" })).toBe("helicopter");
    expect(iconClass({ typeCode: null, category: "A5" })).toBe("widebody");
    expect(iconClass({ typeCode: null, category: "A3" })).toBe("narrowbody");
    expect(iconClass({ typeCode: "ZZZZ", category: "A1" })).toBe("light");
  });

  it("prefers the type over the category", () => {
    expect(iconClass({ typeCode: "B738", category: "A0" })).toBe("narrowbody");
  });

  it("says unknown rather than guessing", () => {
    expect(iconClass({ typeCode: null, category: null })).toBe("unknown");
    expect(iconClass({ typeCode: "ZZZZ", category: "A0" })).toBe("unknown");
    expect(iconClass({ typeCode: null, category: "A2" })).toBe("unknown"); // regional jet or turboprop
  });
});
