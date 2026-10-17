"use client";

import { useEffect, useState } from "react";
import { lookupPhoto, photoCredit, type Photo } from "../../lib/photos";

/**
 * Planespotters.net photo (SPEC 5.7). Shows nothing when there is no photo.
 * Their terms: credit the photographer next to the image, link the thumbnail
 * to the photo page unchanged (no nofollow), and load the image directly
 * from their servers, so this is a plain <img>, not next/image.
 */
export function AircraftPhoto({ hex, registration }: { hex: string; registration: string | null }) {
  const [photo, setPhoto] = useState<{ hex: string; photo: Photo } | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    lookupPhoto(hex, ctrl.signal).then((p) => {
      if (!ctrl.signal.aborted) setPhoto(p ? { hex, photo: p } : null);
    });
    return () => ctrl.abort();
  }, [hex]);

  if (!photo || photo.hex !== hex) return null;
  const { src, width, height, link, photographer } = photo.photo;

  return (
    <figure className="mb-4">
      <a href={link} target="_blank" rel="noopener" className="block overflow-hidden rounded-xl border border-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element -- Planespotters terms forbid proxying or re-hosting the image */}
        <img src={src} width={width} height={height} alt={photoCredit(registration, photographer)} className="h-auto w-full" />
      </a>
      <figcaption className="mt-1.5 text-xs leading-snug text-muted">{photoCredit(registration, photographer)}</figcaption>
    </figure>
  );
}
