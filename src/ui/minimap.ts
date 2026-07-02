/**
 * Minimap — top-right corner overview of the track + player position.
 * Rendered in screen-space after the main camera transform is restored.
 */

import { CarState } from '../game/car';
import { TILE_SIZE, COLOR_GRASS, COLOR_ROAD, COLOR_WALL } from '../game/constants';

/** Minimap display size in CSS pixels. */
const MINIMAP_SIZE = 180;
/** Padding from top-right corner. */
const PADDING = 12;
/** Border radius for the rounded minimap frame. */
const BORDER_RADIUS = 8;

/**
 * Draw the minimap in the top-right corner.
 * Must be called AFTER `removeCamera` so we're in screen-space.
 */
export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  grid: string[][],
  tileColors: Record<string, string>,
  player: CarState,
  canvasW: number,
  canvasH: number,
): void {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 1;

  // Compute scale to fit the grid into the minimap square, maintaining aspect ratio
  const worldW = cols * TILE_SIZE;
  const worldH = rows * TILE_SIZE;
  const scaleX = MINIMAP_SIZE / worldW;
  const scaleY = MINIMAP_SIZE / worldH;
  const scale = Math.min(scaleX, scaleY);

  const mapW = worldW * scale;
  const mapH = worldH * scale;

  // Position — anchored top-right
  const mapX = canvasW - mapW - PADDING;
  const mapY = PADDING;

  ctx.save();

  // ── Frame background ──────────────────────────────────────────
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  roundRect(ctx, mapX - 3, mapY - 3, mapW + 6, mapH + 6, BORDER_RADIUS + 2);
  ctx.fill();

  // ── Clip to minimap area ──────────────────────────────────────
  ctx.beginPath();
  roundRect(ctx, mapX, mapY, mapW, mapH, BORDER_RADIUS);
  ctx.clip();

  // ── Draw tiles ────────────────────────────────────────────────
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const tile = grid[row]?.[col];
      const color = (tile && tileColors[tile]) ? tileColors[tile] : COLOR_GRASS;
      ctx.fillStyle = color;
      ctx.fillRect(
        mapX + col * TILE_SIZE * scale,
        mapY + row * TILE_SIZE * scale,
        Math.ceil(TILE_SIZE * scale) + 0.5, // +0.5 to avoid sub-pixel gaps
        Math.ceil(TILE_SIZE * scale) + 0.5,
      );
    }
  }

  // ── Thin inner border ─────────────────────────────────────────
  ctx.beginPath();
  roundRect(ctx, mapX + 0.5, mapY + 0.5, mapW - 1, mapH - 1, BORDER_RADIUS - 0.5);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // ── Player indicator ──────────────────────────────────────────
  const px = mapX + player.x * scale;
  const py = mapY + player.y * scale;
  const dotRadius = Math.max(2.5, 3.5 * (scale * TILE_SIZE / 12));

  // Glow
  ctx.beginPath();
  ctx.arc(px, py, dotRadius + 2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 100, 0.35)';
  ctx.fill();

  // Dot
  ctx.beginPath();
  ctx.arc(px, py, dotRadius, 0, Math.PI * 2);
  ctx.fillStyle = '#ffdd44';
  ctx.fill();

  // Direction line
  const dirLen = dotRadius * 2.5;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(
    px + Math.cos(player.heading) * dirLen,
    py + Math.sin(player.heading) * dirLen,
  );
  ctx.strokeStyle = '#ffdd44';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.restore();
}

/** Helper: draw a rounded rectangle path. */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
