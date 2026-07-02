/**
 * Sprite cache — renders emojis from Twemoji SVGs to offscreen canvases.
 * Each emoji cached once at 2× display size for crisp scaling.
 * Never calls fillText during gameplay.
 */

import { EMOJI_SIZE } from '../game/constants';

const cache = new Map<string, HTMLCanvasElement>();

/** Emoji size to render at; sprites cached at 2× this for crisp scaling. */
const RENDER_SCALE = 2;

/**
 * Map of emoji → Twemoji SVG URL.
 * Uses the Twemoji CDN; in production vendored under public/emoji/.
 */
function twemojiUrl(emoji: string): string {
  const codePoints = [...emoji]
    .map((c) => c.codePointAt(0)!.toString(16))
    .filter((cp) => cp !== 'fe0f') // skip variation selector
    .join('-');
  return `/emoji/${codePoints}.svg`;
}

/**
 * Renders an emoji to an offscreen canvas. Returns the canvas.
 */
function renderEmoji(emoji: string): HTMLCanvasElement {
  const size = EMOJI_SIZE * RENDER_SCALE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Draw placeholder while loading
  ctx.font = `${size * 0.8}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, size / 2, size / 2);

  // Try loading Twemoji SVG
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    // Invalidate bounds cache so it recomputes from the actual SVG pixels
    boundsCache.delete(emoji);
  };
  img.onerror = () => {
    // Fallback: emoji text already drawn, keep it
  };
  img.src = twemojiUrl(emoji);

  return canvas;
}

/**
 * Get the cached sprite for an emoji. Loads it on first access.
 */
export function getSprite(emoji: string): HTMLCanvasElement {
  let sprite = cache.get(emoji);
  if (!sprite) {
    sprite = renderEmoji(emoji);
    cache.set(emoji, sprite);
  }
  return sprite;
}

/**
 * Scan a sprite canvas and find the tight bounding box of visible content.
 * The box is aligned with the sprite axes (not rotated).
 * Returns null if the sprite has no visible content (e.g. hasn't loaded).
 */
export interface SpriteBounds {
  halfWidth: number;   // x half-extent of visible content (display px)
  halfLength: number;  // y half-extent of visible content (display px)
  offsetX: number;     // content centroid X offset from canvas center (display px)
  offsetY: number;     // content centroid Y offset from canvas center (display px)
}

export function computeSpriteBounds(sprite: HTMLCanvasElement): SpriteBounds | null {
  const ctx = sprite.getContext('2d');
  if (!ctx) return null;

  const imageData = ctx.getImageData(0, 0, sprite.width, sprite.height);
  const pixels = imageData.data;
  const w = sprite.width;
  const h = sprite.height;

  let minX = w, maxX = -1, minY = h, maxY = -1;
  let hasContent = false;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const alpha = pixels[(py * w + px) * 4 + 3];
      if (alpha < 24) continue;
      hasContent = true;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
  }

  if (!hasContent) return null;

  const scale = RENDER_SCALE;
  const contentCx = (minX + maxX) / 2; // center of content, in render-scale coords
  const contentCy = (minY + maxY) / 2;
  const canvasCx = (w - 1) / 2;        // center of canvas, in render-scale coords
  const canvasCy = (h - 1) / 2;

  return {
    halfWidth: (maxX - minX) / 2 / scale,
    halfLength: (maxY - minY) / 2 / scale,
    offsetX: (contentCx - canvasCx) / scale,
    offsetY: (contentCy - canvasCy) / scale,
  };
}

const boundsCache = new Map<string, SpriteBounds | null>();

/**
 * Get the visible-content bounds for an emoji sprite.
 * Returns half-width and half-length in display pixels, or null if not yet known.
 */
export function getSpriteBounds(emoji: string): SpriteBounds | null {
  const cached = boundsCache.get(emoji);
  if (cached !== undefined) return cached;

  const sprite = getSprite(emoji);
  const bounds = computeSpriteBounds(sprite);
  boundsCache.set(emoji, bounds);
  return bounds;
}

/**
 * Draw a sprite to a context at a given position, with rotation.
 * The emoji's visible content is centered at (x, y) — offsets compensate
 * for transparent padding in the sprite canvas.
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  emoji: string,
  x: number,
  y: number,
  angle: number,
  size: number = EMOJI_SIZE
): void {
  const sprite = getSprite(emoji);
  const halfSize = size / 2;
  const bounds = getSpriteBounds(emoji);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const ox = bounds ? -bounds.offsetX : 0;
  const oy = bounds ? -bounds.offsetY : 0;
  ctx.drawImage(sprite, -halfSize + ox, -halfSize + oy, size, size);
  ctx.restore();
}

/**
 * Draw a drop shadow for a sprite.
 */
export function drawSpriteShadow(
  ctx: CanvasRenderingContext2D,
  emoji: string,
  x: number,
  y: number,
  angle: number,
  size: number = EMOJI_SIZE
): void {
  const sprite = getSprite(emoji);
  const halfSize = size / 2;
  const shadowOffset = size * 0.15;
  const bounds = getSpriteBounds(emoji);

  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.translate(x, y);
  ctx.rotate(angle);
  const ox = bounds ? -bounds.offsetX : 0;
  const oy = bounds ? -bounds.offsetY : 0;
  ctx.translate(shadowOffset, shadowOffset);
  ctx.drawImage(sprite, -halfSize + ox, -halfSize + oy, size, size);
  ctx.restore();
}

/**
 * Preload all emojis used by the game. Returns a promise that resolves
 * when all are loaded (or failed gracefully).
 */
export async function preloadSprites(emojis: string[]): Promise<void> {
  const unique = [...new Set(emojis)];
  const promises = unique.map((emoji) => {
    return new Promise<void>((resolve) => {
      const codePoints = [...emoji]
        .map((c) => c.codePointAt(0)!.toString(16))
        .filter((cp) => cp !== 'fe0f')
        .join('-');
      const url = `/emoji/${codePoints}.svg`;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const size = EMOJI_SIZE * RENDER_SCALE;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;

      img.onload = () => {
        ctx.drawImage(img, 0, 0, size, size);
        cache.set(emoji, canvas);
        resolve();
      };
      img.onerror = () => {
        // Fallback text
        ctx.font = `${size * 0.8}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, size / 2, size / 2);
        cache.set(emoji, canvas);
        resolve();
      };
      img.src = url;
    });
  });
  await Promise.all(promises);
}
