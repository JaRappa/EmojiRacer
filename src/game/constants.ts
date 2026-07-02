/**
 * Game constants — single source of truth for all tunable values.
 */

// --- Physics ---
export const ACCEL = 450;            // px/s² — punchy off the line
export const BRAKE = 550;            // px/s² — strong stopping power
export const DRAG = 0.45;            // /s — natural deceleration (low = fast)
export const OFFROAD_DRAG = 6.0;     // /s — additional drag in grass/sand
export const MAX_SPEED = 420;        // px/s — terminal velocity on road
export const STEER_TORQUE = 14;      // rad/s² — how fast turn rate builds (rotational inertia)
export const ANGULAR_DRAG = 5;       // /s — how fast the car straightens out when you let go
export const MAX_ANGULAR_VELOCITY = 5.5; // rad/s — fastest possible turn rate
export const GRIP = 180;             // px/s — above this speed, understeer kicks in (higher = grippier)

// --- World scale ---
export const TILE_SIZE = 64;       // px per tile
export const EMOJI_SIZE = 48;      // car render size in px

// --- Car emoji ---
export const PLAYER_EMOJI = '🏎️';

// --- Colors ---
export const COLOR_GRASS = '#2d5a1e';
export const COLOR_ROAD = '#555555';
export const COLOR_WALL = '#8b7355';
