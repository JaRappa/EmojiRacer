/**
 * Camera — follow player with critically-damped smoothing + speed-based zoom.
 * Camera is a render-only concern.
 */

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

const LERP_FACTOR = 1 - Math.exp(-6 / 60); // critically damped, computed per tick at 60 Hz
const ZOOM_STANDSTILL = 1.15;
const ZOOM_MAX_SPEED = 0.85;

export function createCamera(): { state: CameraState; update: (targetX: number, targetY: number, speed: number, maxSpeed: number, dt: number) => void } {
  const state: CameraState = { x: 0, y: 0, zoom: ZOOM_STANDSTILL };

  function update(targetX: number, targetY: number, speed: number, maxSpeed: number, dt: number): void {
    // Smooth follow
    const lerpT = Math.min(1, LERP_FACTOR * 60 * dt); // scale by dt ratio
    state.x += (targetX - state.x) * lerpT;
    state.y += (targetY - state.y) * lerpT;

    // Speed-based zoom
    const speedRatio = Math.abs(speed) / maxSpeed;
    const targetZoom = ZOOM_STANDSTILL + (ZOOM_MAX_SPEED - ZOOM_STANDSTILL) * speedRatio;
    state.zoom += (targetZoom - state.zoom) * lerpT;
  }

  return { state, update };
}

/**
 * Apply camera transform to a canvas context.
 */
export function applyCamera(ctx: CanvasRenderingContext2D, cam: CameraState, canvasW: number, canvasH: number): void {
  ctx.save();
  ctx.translate(canvasW / 2, canvasH / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);
}

/**
 * Restore camera transform.
 */
export function removeCamera(ctx: CanvasRenderingContext2D): void {
  ctx.restore();
}
