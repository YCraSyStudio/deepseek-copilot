/**
 * Pure zoom maths for the image lightbox.
 *
 * The zoom value is always a percentage of the natural image size, so the label
 * shown to the user matches the pixels that are actually rendered. `null` means
 * "fit the image to the window", which is the state the lightbox opens in.
 */

const MIN_IMAGE_ZOOM = 10;
const MAX_IMAGE_ZOOM = 800;

/** Each click of the zoom buttons scales by a quarter step. */
const ZOOM_FACTOR = 1.25;

export interface ImageSize {
  width: number;
  height: number;
}

/**
 * Percentage of the natural image size that fits the viewport without
 * upscaling an image that is already smaller than the available space.
 */
export function fitZoomPercent(image: ImageSize, viewport: ImageSize): number {
  if (image.width <= 0 || image.height <= 0 || viewport.width <= 0 || viewport.height <= 0) {
    return 100;
  }
  const scale = Math.min(viewport.width / image.width, viewport.height / image.height, 1);
  return Math.min(100, Math.max(1, Math.round(scale * 100)));
}

/** Percentage that must be rendered: the user's choice, or the fit percentage. */
export function resolveZoomPercent(
  zoom: number | null,
  image: ImageSize | null,
  viewport: ImageSize | null,
): number {
  if (zoom !== null) {
    return clampZoomPercent(zoom);
  }
  return image && viewport ? fitZoomPercent(image, viewport) : 100;
}

export function zoomInPercent(percent: number): number {
  return clampZoomPercent(percent * ZOOM_FACTOR);
}

export function zoomOutPercent(percent: number): number {
  return clampZoomPercent(percent / ZOOM_FACTOR);
}

export function canZoomIn(percent: number): boolean {
  return percent < MAX_IMAGE_ZOOM;
}

export function canZoomOut(percent: number): boolean {
  return percent > MIN_IMAGE_ZOOM;
}

/** Rendered pixel size for a zoom percentage, keeping the aspect ratio. */
export function scaledSize(image: ImageSize, percent: number): ImageSize {
  const scale = percent / 100;
  return { width: Math.round(image.width * scale), height: Math.round(image.height * scale) };
}

/** Clamps a user-selected zoom percentage to the supported range. */
export function clampZoomPercent(percent: number): number {
  if (!Number.isFinite(percent)) {
    return 100;
  }
  return Math.min(MAX_IMAGE_ZOOM, Math.max(MIN_IMAGE_ZOOM, Math.round(percent)));
}
