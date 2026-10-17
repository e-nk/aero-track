import type { Map as MapLibreMap } from "maplibre-gl";
import type { AltitudeBand } from "../../lib/geo";
import type { IconClass } from "../../lib/iconClass";
import { BAND_COLOUR, PALETTE } from "../../lib/palette";

// Original top-down silhouettes on a 32×32 grid, nose pointing up (north).
const SHAPES: Record<IconClass | "dot", string> = {
  narrowbody:
    '<path d="M16 2C17.2 2 17.6 3.5 17.6 5V12L29 18.5V20.5L17.6 17.5L17.4 25L21 27.8V29.3L16 28L11 29.3V27.8L14.6 25L14.4 17.5L3 20.5V18.5L14.4 12V5C14.4 3.5 14.8 2 16 2Z"/>',
  widebody:
    '<path d="M16 1C17.6 1 18.2 3 18.2 5V11.5L31 19V21.2L18.2 18L18 25.5L22.5 28.5V30.2L16 28.8L9.5 30.2V28.5L14 25.5L13.8 18L1 21.2V19L13.8 11.5V5C13.8 3 14.4 1 16 1Z"/>',
  turboprop:
    '<path d="M16 3C17 3 17.4 4.2 17.4 5.5V11L29.5 12V14.5L17.4 15L17.2 25L20.5 26.5V28L16 27.3L11.5 28V26.5L14.8 25L14.6 15L2.5 14.5V12L14.6 11V5.5C14.6 4.2 15 3 16 3Z"/>',
  light:
    '<path d="M16 6C16.9 6 17.2 7 17.2 8V12L27 12.6V14.6L17.2 15L17 23L20 24V25.4L16 25L12 25.4V24L15 23L14.8 15L5 14.6V12.6L14.8 12V8C14.8 7 15.1 6 16 6Z"/>',
  helicopter:
    '<path d="M5 4.5L27.5 22.8L26.5 24L4 5.7ZM27 4.5L28 5.7L5.5 24L4.5 22.8Z"/><path d="M16 9C18.2 9 19.4 11 19.4 14C19.4 17 18.2 19 17 19.6L16.8 28L19 28.6V29.8H13V28.6L15.2 28L15 19.6C13.8 19 12.6 17 12.6 14C12.6 11 13.8 9 16 9Z"/>',
  unknown: '<path d="M16 3L26 28L16 22L6 28Z"/>',
  dot: '<circle cx="16" cy="16" r="6"/>',
};

const BANDS = Object.keys(BAND_COLOUR) as AltitudeBand[];
const SIZE = 32;
const PIXEL_RATIO = 2;

export const iconName = (icon: string, band: string) => `${icon}-${band}`;

function svg(shape: string, fill: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE * PIXEL_RATIO}" height="${SIZE * PIXEL_RATIO}" viewBox="0 0 ${SIZE} ${SIZE}"><g fill="${fill}" stroke="${PALETTE.navy}" stroke-width="1.4" stroke-linejoin="round">${shape}</g></svg>`;
}

function rasterize(markup: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image(SIZE * PIXEL_RATIO, SIZE * PIXEL_RATIO);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = SIZE * PIXEL_RATIO;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("2D canvas unavailable"));
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
    };
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  });
}

/** Adds every icon × altitude-band colour to the map's image set. */
export async function addAircraftIcons(map: MapLibreMap): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (const [icon, shape] of Object.entries(SHAPES)) {
    for (const band of BANDS) {
      const name = iconName(icon, band);
      if (map.hasImage(name)) continue;
      jobs.push(
        rasterize(svg(shape, BAND_COLOUR[band])).then((data) => {
          if (!map.hasImage(name)) map.addImage(name, data, { pixelRatio: PIXEL_RATIO });
        }),
      );
    }
  }
  await Promise.all(jobs);
}
