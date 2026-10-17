export type IconClass = "narrowbody" | "widebody" | "turboprop" | "light" | "helicopter" | "unknown";

// ICAO type designators. Exact codes first, then safe prefixes.
const EXACT: Record<string, IconClass> = {
  C150: "light", C152: "light", C162: "light", C170: "light", C172: "light", C175: "light",
  C177: "light", C180: "light", C182: "light", C185: "light", C206: "light", C210: "light",
  P28A: "light", P28B: "light", P28R: "light", P32R: "light", PA34: "light", PA44: "light",
  DA20: "light", DA40: "light", DA42: "light", DA62: "light", SR20: "light", SR22: "light",
  M20P: "light", M20T: "light", BE33: "light", BE35: "light", BE36: "light", BE58: "light",
  B350: "turboprop", BE20: "turboprop", BE30: "turboprop", BE9L: "turboprop", PC12: "turboprop",
  C208: "turboprop", SF34: "turboprop", SW4: "turboprop", JS32: "turboprop", D328: "turboprop", F50: "turboprop",
  R22: "helicopter", R44: "helicopter", R66: "helicopter", B06: "helicopter", B407: "helicopter",
  B412: "helicopter", S76: "helicopter", A109: "helicopter", A139: "helicopter", A169: "helicopter",
  EC20: "helicopter", EC30: "helicopter", EC35: "helicopter", EC45: "helicopter", EC55: "helicopter",
  AS50: "helicopter", AS55: "helicopter", AS65: "helicopter", H160: "helicopter",
  E170: "narrowbody", E175: "narrowbody", E190: "narrowbody", E195: "narrowbody", E290: "narrowbody",
  E295: "narrowbody", BCS1: "narrowbody", BCS3: "narrowbody", F100: "narrowbody", B712: "narrowbody",
  MD11: "widebody",
};

const PREFIX: [string, IconClass][] = [
  ["A30", "widebody"], ["A33", "widebody"], ["A34", "widebody"], ["A35", "widebody"], ["A38", "widebody"],
  ["B74", "widebody"], ["B76", "widebody"], ["B77", "widebody"], ["B78", "widebody"],
  ["A31", "narrowbody"], ["A32", "narrowbody"], ["A20", "narrowbody"], ["A21", "narrowbody"],
  ["B73", "narrowbody"], ["B37", "narrowbody"], ["B38", "narrowbody"], ["B39", "narrowbody"],
  ["B75", "narrowbody"], ["CRJ", "narrowbody"],
  ["DH8", "turboprop"], ["AT4", "turboprop"], ["AT7", "turboprop"],
];

// ADS-B emitter categories. A2 covers both regional jets and turboprops, so it isn't mapped.
const CATEGORY: Record<string, IconClass> = {
  A1: "light",
  A3: "narrowbody",
  A4: "narrowbody",
  A5: "widebody",
  A7: "helicopter",
};

/** Map icon class from the type designator, then the emitter category. Never guesses beyond that. */
export function iconClass({ typeCode, category }: { typeCode: string | null; category: string | null }): IconClass {
  if (typeCode) {
    const exact = EXACT[typeCode];
    if (exact) return exact;
    const prefix = PREFIX.find(([p]) => typeCode.startsWith(p));
    if (prefix) return prefix[1];
  }
  return (category && CATEGORY[category]) || "unknown";
}
