/**
 * Pure scroll maths for the image lightbox.
 *
 * The viewport scrolls instead of stretching the image, so zooming in keeps the
 * aspect ratio and the user pans with the scrollbars, the wheel or a drag. These
 * helpers decide where the viewport should be scrolled to: centred on open, and
 * on the same spot after a zoom step or a window resize.
 */

import type { ImageSize } from "./ImageZoom";

/** Scroll position of the lightbox viewport, in pixels. */
export interface ScrollOffset {
  left: number;
  top: number;
}

/** Largest scrollable offset; zero on an axis whose content fits the viewport. */
export function maxScrollOffset(content: ImageSize, viewport: ImageSize): ScrollOffset {
  return {
    left: Math.max(0, Math.round(content.width - viewport.width)),
    top: Math.max(0, Math.round(content.height - viewport.height)),
  };
}

/** Offset that centres the content inside the viewport. */
export function centeredScrollOffset(content: ImageSize, viewport: ImageSize): ScrollOffset {
  const max = maxScrollOffset(content, viewport);
  return { left: Math.round(max.left / 2), top: Math.round(max.top / 2) };
}

/**
 * Offset to apply once the content has been resized (zoom) or the viewport has
 * changed size, given the offset in use before the change.
 *
 * The relative scroll position is preserved, so the part of the image the user
 * dragged to the middle stays in the middle. Content that did not scroll before
 * (a fitted image) centres the resized one, which is what makes the first zoom
 * step reveal the middle of the picture instead of a corner.
 */
export function rescaledScrollOffset(
  offset: ScrollOffset,
  previous: ImageSize,
  next: ImageSize,
  viewport: ImageSize,
): ScrollOffset {
  const previousMax = maxScrollOffset(previous, viewport);
  const nextMax = maxScrollOffset(next, viewport);
  return {
    left: rescaleAxis(offset.left, previousMax.left, nextMax.left),
    top: rescaleAxis(offset.top, previousMax.top, nextMax.top),
  };
}

function rescaleAxis(offset: number, previousMax: number, nextMax: number): number {
  if (nextMax <= 0) {
    return 0;
  }
  if (previousMax <= 0) {
    return Math.round(nextMax / 2);
  }
  const ratio = Math.min(1, Math.max(0, offset / previousMax));
  return Math.round(ratio * nextMax);
}
