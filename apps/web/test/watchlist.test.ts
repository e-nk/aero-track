import { describe, expect, it } from "vitest";
import { WATCH_KEY, createWatchlist } from "../lib/watchlist";

const memoryStorage = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
};

describe("watchlist", () => {
  it("adds, lists and removes, and remembers across instances", () => {
    const storage = memoryStorage();
    const w = createWatchlist(storage);
    expect(w.add("7c6db7")).toBe(true);
    expect(w.add("7c6db7")).toBe(true);
    expect(w.list()).toEqual(["7c6db7"]);
    expect(createWatchlist(storage).has("7c6db7")).toBe(true);
    w.remove("7c6db7");
    expect(createWatchlist(storage).list()).toEqual([]);
    expect(storage.data.get(WATCH_KEY)).toBe("[]");
  });

  it("refuses more than the limit", () => {
    const w = createWatchlist(memoryStorage(), 2);
    expect([w.add("a"), w.add("b"), w.add("c")]).toEqual([true, true, false]);
    expect(w.list()).toEqual(["a", "b"]);
  });

  it("ignores garbage in storage", () => {
    const storage = memoryStorage();
    storage.setItem(WATCH_KEY, "{not json");
    expect(createWatchlist(storage).list()).toEqual([]);
    storage.setItem(WATCH_KEY, JSON.stringify(["ok", 42, null]));
    expect(createWatchlist(storage).list()).toEqual(["ok"]);
  });

  it("works in memory when storage throws or is missing", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const w = createWatchlist(throwing);
    expect(w.add("a")).toBe(true);
    expect(w.list()).toEqual(["a"]);
    expect(createWatchlist(null).add("b")).toBe(true);
  });
});
