import { describe, expect, it } from "vitest";
import { mergeIndex, parseWhen } from "../src/recordings/offline";

describe("parseWhen", () => {
  it("accepts epoch seconds or an ISO time", () => {
    expect(parseWhen("1792200000")).toBe(1792200000);
    expect(parseWhen("2026-10-17T12:20:00+11:00")).toBe(1792200000);
  });

  it("rejects anything else", () => {
    expect(() => parseWhen("tomorrow")).toThrow(/Not a time/);
  });
});

describe("mergeIndex", () => {
  const meta = (id: string, capturedFrom: number) => ({ id, capturedFrom, title: id }) as never;

  it("adds or replaces by id, newest first", () => {
    const index = mergeIndex([meta("a", 1), meta("b", 3)], meta("a", 5));
    expect(index.map((m: { id: string }) => m.id)).toEqual(["a", "b"]);
    expect(mergeIndex(index, meta("c", 2)).map((m: { id: string }) => m.id)).toEqual(["a", "b", "c"]);
  });
});
