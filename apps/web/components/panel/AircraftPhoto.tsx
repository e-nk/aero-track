"use client";

import { useEffect, useState } from "react";
import { lookupPhoto, photoCredit, photoStatus, type Photo } from "../../lib/photos";

/**
 * Planespotters.net photo (SPEC 5.7). A placeholder while it loads, a short note when there is none.
 * Their terms: credit the photographer next to the image, link the thumbnail
 * to the photo page unchanged (no nofollow), and load the image directly
 * from their servers, so this is a plain <img>, not next/image.
 */
export function AircraftPhoto({ hex, registration }: { hex: string; registration: string | null }) {
  const [lookup, setLookup] = useState<{ hex: string; photo: Photo | null } | null>(null);
  // Per image URL, so a new aircraft starts as "pending" without resetting state in an effect.
  const [image, setImage] = useState<{ src: string; state: "loaded" | "error" } | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    lookupPhoto(hex, ctrl.signal).then((p) => {
      if (!ctrl.signal.aborted) setLookup({ hex, photo: p });
    });
    return () => ctrl.abort();
  }, [hex]);

  const photo = lookup?.hex === hex ? lookup.photo : null;
  const status = photoStatus(lookup, hex, photo && image?.src === photo.src ? image.state : "pending");

  if (status === "none") return <p className="mb-4 text-xs text-muted">No photo available for this aircraft.</p>;

  return (
    <figure className="mb-4" aria-busy={status === "loading"}>
      {status === "loading" && (
        <div className="flex aspect-[3/2] w-full animate-pulse items-center justify-center rounded-xl border border-white/10 bg-white/5">
          <span className="text-xs text-muted">Looking for a photo…</span>
        </div>
      )}
      {photo && (
        <a
          href={photo.link}
          target="_blank"
          rel="noopener"
          className={`block overflow-hidden rounded-xl border border-white/10 ${status === "ready" ? "" : "hidden"}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Planespotters terms forbid proxying or re-hosting the image */}
          <img
            src={photo.src}
            width={photo.width}
            height={photo.height}
            alt={photoCredit(registration, photo.photographer)}
            className="h-auto w-full"
            onLoad={() => setImage({ src: photo.src, state: "loaded" })}
            onError={() => setImage({ src: photo.src, state: "error" })}
          />
        </a>
      )}
      {status === "ready" && photo && (
        <figcaption className="mt-1.5 text-xs leading-snug text-muted">{photoCredit(registration, photo.photographer)}</figcaption>
      )}
    </figure>
  );
}
