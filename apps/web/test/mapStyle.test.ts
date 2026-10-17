import { describe, expect, it } from "vitest";
import { OFFLINE_FONTS, offlineStyle } from "../lib/mapStyle";

describe("offlineStyle", () => {
  const style = offlineStyle("http://localhost:3001");

  it("reads tiles, fonts and sprites from the app itself, never the internet", () => {
    expect(style.sources.protomaps).toMatchObject({
      type: "vector",
      url: "pmtiles://http://localhost:3001/offline/sydney.pmtiles",
    });
    expect(style.glyphs).toBe("http://localhost:3001/offline/fonts/{fontstack}/{range}.pbf");
    expect(style.sprite).toBe("http://localhost:3001/offline/sprites/v4/dark");
  });

  it("credits Protomaps and OpenStreetMap", () => {
    const source = style.sources.protomaps as { attribution?: string };
    expect(source.attribution).toMatch(/Protomaps/);
    expect(source.attribution).toMatch(/OpenStreetMap/);
  });

  it("only uses fonts we ship offline", () => {
    const used = new Set<string>();
    const walk = (v: unknown) => {
      if (typeof v === "string" && v.startsWith("Noto Sans")) used.add(v);
      else if (Array.isArray(v)) v.forEach(walk);
    };
    for (const layer of style.layers) walk((layer as { layout?: { "text-font"?: unknown } }).layout?.["text-font"]);
    expect(used.size).toBeGreaterThan(0);
    for (const font of used) expect(OFFLINE_FONTS).toContain(font);
  });

  it("has the basemap layers", () => {
    expect(style.layers.length).toBeGreaterThan(20);
  });
});
