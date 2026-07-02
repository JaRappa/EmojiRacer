/**
 * Car physics + state — arcade model.
 * Each car is a point with position, heading, and scalar speed.
 */

import { ACCEL, BRAKE, DRAG, MAX_SPEED, OFFROAD_DRAG, STEER_TORQUE, ANGULAR_DRAG, MAX_ANGULAR_VELOCITY, GRIP, TILE_SIZE, EMOJI_SIZE } from './constants';

export interface CarState {
  x: number;
  y: number;
  speed: number;
  heading: number;      // radians, 0 = right
  angularVelocity: number; // rad/s — rotational momentum
  halfWidth: number;    // side-to-side half-extent of hitbox (px)
  halfLength: number;   // front-to-back half-extent of hitbox (px)
  isOnRoad: boolean;
  steerInput: number;
  throttleInput: number;
}

export interface CarConfig {
  startX: number;
  startY: number;
  startHeading?: number;
  halfWidth?: number;
  halfLength?: number;
}

const DEFAULT_HALF = EMOJI_SIZE / 4;

export function createCar(config: CarConfig): CarState {
  return {
    x: config.startX,
    y: config.startY,
    speed: 0,
    heading: config.startHeading ?? 0,
    angularVelocity: 0,
    halfWidth: config.halfWidth ?? DEFAULT_HALF,
    halfLength: config.halfLength ?? DEFAULT_HALF,
    isOnRoad: true,
    steerInput: 0,
    throttleInput: 0,
  };
}

/**
 * Simulate one tick of car physics.
 *
 * Arcade model with rotational inertia and speed-dependent understeer:
 * - Speed: throttle accelerates, drag + surface friction decelerate
 * - Steering: input applies TORQUE to angularVelocity (NOT directly to heading).
 *   angularVelocity faces drag (ANGULAR_DRAG) that straightens the car naturally.
 * - Grip: at speeds above GRIP, maximum turn rate is reduced (understeer).
 *   At low speeds, you have full steering authority.
 * - Off-road: extra drag + reduced grip (understeers more on grass).
 */
export function simulateCar(car: CarState, dt: number, onRoad: boolean): void {
  car.isOnRoad = onRoad;

  // ── Linear motion ──────────────────────────────────────────────
  // Throttle / brake
  if (car.throttleInput > 0) {
    car.speed += ACCEL * car.throttleInput * dt;
  } else if (car.throttleInput < 0) {
    car.speed += BRAKE * car.throttleInput * dt;
  }

  // Drag + surface
  const dragFactor = onRoad ? DRAG : DRAG + OFFROAD_DRAG;
  car.speed *= 1 - dragFactor * dt;

  // Clamp speed
  if (car.speed > MAX_SPEED) car.speed = MAX_SPEED;
  if (car.speed < -MAX_SPEED * 0.5) car.speed = -MAX_SPEED * 0.5;

  // ── Rotational motion (steering with inertia) ──────────────────
  // Apply steering torque to angular velocity
  // On grass, reduce steering authority
  const surfaceGrip = onRoad ? 1.0 : 0.5;
  car.angularVelocity += STEER_TORQUE * car.steerInput * surfaceGrip * dt;

  // Angular drag — the car naturally straightens out
  car.angularVelocity *= 1 - ANGULAR_DRAG * dt;

  // Clamp angular velocity
  // Understeer: at high speed, max turn rate scales down
  const speedRatio = Math.min(1, Math.abs(car.speed) / GRIP);
  const gripFactor = 1 - speedRatio * 0.75; // 25% of max turn rate at full speed
  const maxOmega = MAX_ANGULAR_VELOCITY * gripFactor;
  if (car.angularVelocity > maxOmega) car.angularVelocity = maxOmega;
  if (car.angularVelocity < -maxOmega) car.angularVelocity = -maxOmega;

  // Don't turn if barely moving
  if (Math.abs(car.speed) < 2) {
    car.angularVelocity *= 1 - 8 * dt; // rapid damping when stationary
  }

  // Apply rotation
  car.heading += car.angularVelocity * dt;

  // ── Position update ────────────────────────────────────────────
  car.x += Math.cos(car.heading) * car.speed * dt;
  car.y += Math.sin(car.heading) * car.speed * dt;
}

/**
 * Check if a point (px) is on a road tile in the grid.
 */
export function isPointOnRoad(
  px: number, py: number,
  grid: string[][],
  roadChars: Set<string>
): boolean {
  const col = Math.floor(px / TILE_SIZE);
  const row = Math.floor(py / TILE_SIZE);
  if (row < 0 || row >= grid.length || col < 0 || col >= (grid[0]?.length ?? 0)) {
    return false;
  }
  return roadChars.has(grid[row][col]);
}

/**
 * OBB-vs-AABB collision with wall tiles using Separating Axis Theorem.
 * Returns the corrected position (mutated in place) and whether a collision happened.
 */
export function resolveWallCollision(
  car: CarState,
  grid: string[][],
  wallChars: Set<string>
): boolean {
  // Precompute car axes
  const cosH = Math.cos(car.heading);
  const sinH = Math.sin(car.heading);
  let collided = false;

  // Check surrounding tiles
  const extent = Math.max(car.halfWidth, car.halfLength) * Math.SQRT2 + 1;
  const minCol = Math.floor((car.x - extent) / TILE_SIZE);
  const maxCol = Math.floor((car.x + extent) / TILE_SIZE);
  const minRow = Math.floor((car.y - extent) / TILE_SIZE);
  const maxRow = Math.floor((car.y + extent) / TILE_SIZE);

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const isWall =
        row < 0 || row >= grid.length ||
        col < 0 || col >= (grid[0]?.length ?? 0) ||
        wallChars.has(grid[row][col]);
      if (!isWall) continue;

      const tileLeft = col * TILE_SIZE;
      const tileTop = row * TILE_SIZE;
      const result = obbVsAABB(car.x, car.y, car.halfWidth, car.halfLength, cosH, sinH, tileLeft, tileTop, TILE_SIZE, TILE_SIZE);
      if (result.hit) {
        car.x += result.pushX;
        car.y += result.pushY;

        // ── Wall normal from push direction ────────────────────
        const pushLen = Math.sqrt(result.pushX * result.pushX + result.pushY * result.pushY);
        if (pushLen > 0.001) {
          const nx = result.pushX / pushLen; // wall normal (points away from wall)
          const ny = result.pushY / pushLen;

          // Car's forward direction
          const fx = Math.cos(car.heading);
          const fy = Math.sin(car.heading);

          // How head-on is the collision? 1 = perpendicular hit, 0 = parallel scrape
          const dot = fx * nx + fy * ny; // negative when moving into the wall
          const impact = Math.abs(Math.min(0, dot)); // clamped 0..1

          // ── Speed: lose 15% (scrape) to 55% (head-on) ──────
          car.speed *= 0.85 - impact * 0.4;

          // ── Heading: reflect off wall, blend toward deflection ──
          if (dot < 0) {
            // Reflect forward vector: f' = f - 2(f·n)n
            const rfx = fx - 2 * dot * nx;
            const rfy = fy - 2 * dot * ny;
            const reflected = Math.atan2(rfy, rfx);

            // Blend: light scrape barely redirects; head-on bounces strongly
            const blend = 0.2 + impact * 0.6; // 0.2 .. 0.8
            let diff = reflected - car.heading;
            while (diff > Math.PI) diff -= 2 * Math.PI;
            while (diff < -Math.PI) diff += 2 * Math.PI;
            car.heading += diff * blend;
          }

          // ── Angular velocity: reduce but keep some spin ─────
          car.angularVelocity *= 0.3 + impact * 0.1; // keep 30–40%
        }

        collided = true;
      }
    }
  }

  return collided;
}

interface ObbVsAABBResult {
  hit: boolean;
  pushX: number;
  pushY: number;
}

/**
 * SAT-based OBB vs AABB with minimum-translation-vector resolution.
 * OBB center = (cx, cy), half-extents = (hw, hl), orientation = (cos, sin).
 * AABB origin = (ax, ay), size = (aw, ah).
 */
function obbVsAABB(
  cx: number, cy: number,
  hw: number, hl: number,
  cos: number, sin: number,
  ax: number, ay: number, aw: number, ah: number
): ObbVsAABBResult {
  // AABB center
  const bcx = ax + aw / 2;
  const bcy = ay + ah / 2;

  // Vector from AABB center to OBB center
  const dx = cx - bcx;
  const dy = cy - bcy;

  // Box half-extents in local OBB axes
  const axes = [
    { nx: 1, ny: 0, projOBB: projectOBB(hw, hl, cos, sin, 1, 0), projAABB: aw / 2 },
    { nx: 0, ny: 1, projOBB: projectOBB(hw, hl, cos, sin, 0, 1), projAABB: ah / 2 },
    { nx: cos, ny: sin, projOBB: hw, projAABB: projectAABB(aw, ah, cos, sin) },
    // perpendicular axis is hw/hl swapped
    { nx: -sin, ny: cos, projOBB: hl, projAABB: projectAABB(aw, ah, -sin, cos) },
  ];

  let minOverlap = Infinity;
  let pushX = 0;
  let pushY = 0;

  for (const axis of axes) {
    const separation = dx * axis.nx + dy * axis.ny;
    const dist = Math.abs(separation);
    const overlap = axis.projOBB + axis.projAABB - dist;
    if (overlap <= 0) {
      return { hit: false, pushX: 0, pushY: 0 };
    }
    if (overlap < minOverlap) {
      minOverlap = overlap;
      // Push direction: along the axis, away from AABB
      const sign = separation >= 0 ? 1 : -1;
      pushX = axis.nx * sign * overlap;
      pushY = axis.ny * sign * overlap;
    }
  }

  return { hit: true, pushX, pushY };
}

/** Project OBB half-extents onto a world-space axis. */
function projectOBB(hw: number, hl: number, cos: number, sin: number, ax: number, ay: number): number {
  const rx = cos * ax + sin * ay;
  const ry = -sin * ax + cos * ay;
  return hw * Math.abs(rx) + hl * Math.abs(ry);
}

/** Project AABB half-size onto a world-space axis. */
function projectAABB(aw: number, ah: number, ax: number, ay: number): number {
  return (aw / 2) * Math.abs(ax) + (ah / 2) * Math.abs(ay);
}
