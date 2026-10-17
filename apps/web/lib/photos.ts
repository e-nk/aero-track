// Aircraft photos from Planespotters.net (SPEC 5.7). The browser calls their
// API directly: their terms forbid proxying or re-exposing it through our api.
// URLs are used unchanged; images load straight from their servers.

const API = "https://api.planespotters.net/pub/photos/hex/";
const DAY_MS = 24 * 60 * 60 * 1000; // terms allow caching API responses for up to 24 hours
const PLANESPOTTERS_HOSTS = ["planespotters.net", "plnspttrs.net"];

export interface Photo {
  src: string;
  width: number;
  height: number;
  link: string;
  photographer: string;
}

function isPlanespottersUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && PLANESPOTTERS_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/** The first photo, or null if there is none or the response isn't what we expect. */
export function parsePhotoResponse(body: unknown): Photo | null {
  const photo = (body as { photos?: unknown[] } | null)?.photos?.[0] as
    | { thumbnail_large?: { src?: unknown; size?: { width?: unknown; height?: unknown } }; link?: unknown; photographer?: unknown }
    | undefined;
  if (!photo) return null;
  const large = photo.thumbnail_large;
  const { width, height } = large?.size ?? {};
  if (!isPlanespottersUrl(large?.src) || !isPlanespottersUrl(photo.link)) return null;
  if (typeof photo.photographer !== "string" || !photo.photographer.trim()) return null;
  if (typeof width !== "number" || typeof height !== "number") return null;
  return { src: large.src, width, height, link: photo.link, photographer: photo.photographer.trim() };
}

export interface PhotoLookupOptions {
  fetch?: typeof fetch;
  ttlMs?: number;
  now?: () => number;
}

/** Lookup by ICAO hex with an in-memory cache. Failures mean "no photo", never an error. */
export function createPhotoLookup(opts: PhotoLookupOptions = {}) {
  const doFetch = opts.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const ttlMs = opts.ttlMs ?? DAY_MS;
  const now = opts.now ?? Date.now;
  const cache = new Map<string, { at: number; photo: Photo | null }>();

  return async function lookup(hex: string, signal?: AbortSignal): Promise<Photo | null> {
    if (hex.startsWith("~")) return null; // non-ICAO address: nothing to look up
    const hit = cache.get(hex);
    if (hit && now() - hit.at <= ttlMs) return hit.photo;
    try {
      const res = await doFetch(`${API}${encodeURIComponent(hex)}`, { signal });
      if (!res.ok) return null;
      const photo = parsePhotoResponse(await res.json());
      cache.set(hex, { at: now(), photo });
      return photo;
    } catch {
      return null;
    }
  };
}

export const lookupPhoto = createPhotoLookup();

export function photoCredit(registration: string | null, photographer: string): string {
  const subject = registration ? `Photo of ${registration} by` : "Photo by";
  return `${subject} ${photographer}, via Planespotters.net. It may not show the aircraft's current paint scheme.`;
}
