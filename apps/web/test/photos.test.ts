import { describe, expect, it, vi } from "vitest";
import { createPhotoLookup, parsePhotoResponse, photoCredit, photoStatus } from "../lib/photos";

const VALID = {
  photos: [
    {
      id: "1955614",
      thumbnail: { src: "https://t.plnspttrs.net/15250/1955614_8f9c39c9a5_t.jpg", size: { width: 200, height: 113 } },
      thumbnail_large: { src: "https://t.plnspttrs.net/15250/1955614_8f9c39c9a5_280.jpg", size: { width: 498, height: 280 } },
      link: "https://www.planespotters.net/photo/1955614/vh-xzp-qantas-boeing-737-838-wl?utm_source=api",
      photographer: "Ethan Shi",
    },
  ],
};

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

describe("parsePhotoResponse", () => {
  it("returns the large thumbnail, link and photographer, unchanged", () => {
    expect(parsePhotoResponse(VALID)).toEqual({
      src: "https://t.plnspttrs.net/15250/1955614_8f9c39c9a5_280.jpg",
      width: 498,
      height: 280,
      link: "https://www.planespotters.net/photo/1955614/vh-xzp-qantas-boeing-737-838-wl?utm_source=api",
      photographer: "Ethan Shi",
    });
  });

  it("returns null when there is no photo", () => {
    expect(parsePhotoResponse({ photos: [] })).toBeNull();
    expect(parsePhotoResponse({})).toBeNull();
    expect(parsePhotoResponse(null)).toBeNull();
  });

  it("rejects anything that isn't a Planespotters https URL", () => {
    const bad = structuredClone(VALID);
    bad.photos[0]!.thumbnail_large.src = "http://t.plnspttrs.net/x.jpg";
    expect(parsePhotoResponse(bad)).toBeNull();
    const elsewhere = structuredClone(VALID);
    elsewhere.photos[0]!.link = "https://example.com/photo";
    expect(parsePhotoResponse(elsewhere)).toBeNull();
  });

  it("rejects a photo without a photographer to credit", () => {
    const noCredit = structuredClone(VALID);
    noCredit.photos[0]!.photographer = "";
    expect(parsePhotoResponse(noCredit)).toBeNull();
  });
});

describe("photo lookup", () => {
  it("asks Planespotters by hex and caches the answer", async () => {
    const fetchFn = vi.fn(async () => ok(VALID));
    const lookup = createPhotoLookup({ fetch: fetchFn as unknown as typeof fetch, ttlMs: 1000, now: () => 0 });
    expect((await lookup("7c7803"))?.photographer).toBe("Ethan Shi");
    await lookup("7c7803");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith("https://api.planespotters.net/pub/photos/hex/7c7803", expect.anything());
  });

  it("asks again once the cache has expired", async () => {
    let t = 0;
    const fetchFn = vi.fn(async () => ok({ photos: [] }));
    const lookup = createPhotoLookup({ fetch: fetchFn as unknown as typeof fetch, ttlMs: 1000, now: () => t });
    await lookup("7c7803");
    t = 1001;
    await lookup("7c7803");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("skips non-ICAO addresses, which have no registration", async () => {
    const fetchFn = vi.fn();
    const lookup = createPhotoLookup({ fetch: fetchFn as unknown as typeof fetch, ttlMs: 1000, now: () => 0 });
    expect(await lookup("~2a0b1c")).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("shows nothing when the request fails or is refused", async () => {
    const down = createPhotoLookup({
      fetch: (async () => {
        throw new TypeError("offline");
      }) as unknown as typeof fetch,
      ttlMs: 1000,
      now: () => 0,
    });
    expect(await down("7c7803")).toBeNull();
    const refused = createPhotoLookup({ fetch: (async () => new Response("no", { status: 403 })) as unknown as typeof fetch, ttlMs: 1000, now: () => 0 });
    expect(await refused("7c7803")).toBeNull();
  });
});

describe("photoCredit", () => {
  it("names the registration and photographer, and warns about paint schemes", () => {
    expect(photoCredit("VH-XZP", "Ethan Shi")).toBe(
      "Photo of VH-XZP by Ethan Shi, via Planespotters.net. It may not show the aircraft's current paint scheme.",
    );
    expect(photoCredit(null, "Ethan Shi")).toBe(
      "Photo by Ethan Shi, via Planespotters.net. It may not show the aircraft's current paint scheme.",
    );
  });
});

describe("photoStatus", () => {
  const photo = { src: "https://t.plnspttrs.net/1.jpg", width: 420, height: 280, link: "https://www.planespotters.net/photo/1", photographer: "A" };

  it("is loading until the lookup for this aircraft answers", () => {
    expect(photoStatus(null, "7c0001", "pending")).toBe("loading");
    expect(photoStatus({ hex: "7c0002", photo }, "7c0001", "pending")).toBe("loading"); // answer for a previous aircraft
  });

  it("stays loading while the image file itself downloads", () => {
    expect(photoStatus({ hex: "7c0001", photo }, "7c0001", "pending")).toBe("loading");
  });

  it("is ready once the image has loaded", () => {
    expect(photoStatus({ hex: "7c0001", photo }, "7c0001", "loaded")).toBe("ready");
  });

  it("says there is no photo when the lookup finds none or the image fails", () => {
    expect(photoStatus({ hex: "7c0001", photo: null }, "7c0001", "pending")).toBe("none");
    expect(photoStatus({ hex: "7c0001", photo }, "7c0001", "error")).toBe("none");
  });
});
