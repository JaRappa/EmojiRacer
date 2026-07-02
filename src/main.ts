/**
 * Emoji Racer — bootstrap & game runner.
 * Phase 0: Drives 🏎️ on an empty field with follow/zoom camera, FPS counter.
 */

import { startLoop } from './engine/loop';
import { initInput, InputState } from './engine/input';
import { applyCamera, removeCamera, createCamera, CameraState } from './engine/camera';
import { drawSprite, preloadSprites, getSpriteBounds } from './engine/sprites';
import { createCar, simulateCar, resolveWallCollision, CarState } from './game/car';
import { PLAYER_EMOJI, MAX_SPEED, EMOJI_SIZE, TILE_SIZE, COLOR_GRASS, COLOR_ROAD, COLOR_WALL } from './game/constants';
import { drawMinimap } from './ui/minimap';

// ─── Globals ────────────────────────────────────────────────────────
const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const hud = document.getElementById('hud')!;

let player: CarState;
let camera: { state: CameraState; update: (tx: number, ty: number, speed: number, maxSpeed: number, dt: number) => void };
let input: InputState = { throttle: 0, steer: 0 };

// FPS tracking
let currentFps = 0;

// Dummy grid — all road for Phase 0
const FIELD_ROWS = 20;
const FIELD_COLS = 30;
const grid: string[][] = [];
for (let r = 0; r < FIELD_ROWS; r++) {
  grid[r] = [];
  for (let c = 0; c < FIELD_COLS; c++) {
    // Border walls
    if (r === 0 || r === FIELD_ROWS - 1 || c === 0 || c === FIELD_COLS - 1) {
      grid[r][c] = 'W';
    } else {
      grid[r][c] = 'R'; // all road
    }
  }
}

const wallChars = new Set(['W']);

// Tile → color mapping for minimap
const tileColors: Record<string, string> = {
  R: COLOR_ROAD,
  G: COLOR_GRASS,
  W: COLOR_WALL,
};

// ─── Resize ─────────────────────────────────────────────────────────
function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener('resize', resize);

// ─── Simulation ─────────────────────────────────────────────────────
function simulate(dt: number): void {
  // Apply input to player
  player.steerInput = input.steer;
  player.throttleInput = input.throttle;

  // Determine surface
  const onRoad = true; // Phase 0: all road

  // Simulate physics
  simulateCar(player, dt, onRoad);

  // Wall collision
  resolveWallCollision(player, grid, wallChars);

  // Update camera
  camera.update(player.x, player.y, player.speed, MAX_SPEED, dt);
}

// ─── Rendering ──────────────────────────────────────────────────────
function drawGrid(): void {
  const cam = camera.state;
  const viewW = canvas.width / (window.devicePixelRatio || 1);
  const viewH = canvas.height / (window.devicePixelRatio || 1);

  // Visible tile range
  const halfViewW = viewW / cam.zoom / 2;
  const halfViewH = viewH / cam.zoom / 2;
  const minCol = Math.max(0, Math.floor((cam.x - halfViewW) / TILE_SIZE));
  const maxCol = Math.min(FIELD_COLS - 1, Math.ceil((cam.x + halfViewW) / TILE_SIZE));
  const minRow = Math.max(0, Math.floor((cam.y - halfViewH) / TILE_SIZE));
  const maxRow = Math.min(FIELD_ROWS - 1, Math.ceil((cam.y + halfViewH) / TILE_SIZE));

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const tile = grid[row]?.[col];

      // Fill tile
      if (tile === 'W') {
        ctx.fillStyle = COLOR_WALL;
      } else {
        ctx.fillStyle = COLOR_ROAD;
      }
      ctx.fillRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);

      // No emoji rendering in Phase 0 for tiles — simple colored grid
    }
  }
}

function render(_alpha: number): void {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;

  ctx.clearRect(0, 0, w, h);

  // Grass background
  ctx.fillStyle = COLOR_GRASS;
  ctx.fillRect(0, 0, w, h);

  // Camera transform
  applyCamera(ctx, camera.state, w, h);

  // Draw track
  drawGrid();

  // Car
  drawSprite(ctx, PLAYER_EMOJI, player.x, player.y, player.heading, EMOJI_SIZE);

  removeCamera(ctx);

  // Draw minimap in screen-space (top-right corner)
  const dpr2 = window.devicePixelRatio || 1;
  drawMinimap(ctx, grid, tileColors, player, canvas.width / dpr2);
}

function updateHud(): void {
  const speed = Math.abs(player.speed);
  const speedKmh = Math.round(speed * 3.6 / 100);
  hud.textContent = `FPS: ${currentFps} | Speed: ${speedKmh} km/h`;
}

// ─── Main ───────────────────────────────────────────────────────────
async function main(): Promise<void> {
  resize();

  // Preload sprites
  await preloadSprites([PLAYER_EMOJI]);

  // Compute hitbox from actual sprite content
  const bounds = getSpriteBounds(PLAYER_EMOJI);

  // Create player car at center of field
  player = createCar({
    startX: (FIELD_COLS / 2) * TILE_SIZE,
    startY: (FIELD_ROWS / 2) * TILE_SIZE,
    startHeading: 0,
    halfWidth: bounds?.halfWidth,
    halfLength: bounds?.halfLength,
  });

  // Create camera
  const camObj = createCamera();
  camera = camObj;
  camObj.update(player.x, player.y, 0, MAX_SPEED, 1); // snap to player immediately
  camera.state.x = player.x;
  camera.state.y = player.y;

  // Init input
  initInput(canvas, (s) => { input = s; });

  // FPS tracking
  let fpsFrameCount = 0;
  let fpsAccum = 0;
  let lastTime = 0;

  // Start game loop
  startLoop(
    (dt) => {
      simulate(dt);
    },
    (_alpha) => {
      // Track FPS with wall-clock time
      const now = performance.now() / 1000;
      if (lastTime > 0) {
        fpsAccum += now - lastTime;
        fpsFrameCount++;
      }
      lastTime = now;

      render(_alpha);

      // Update FPS at ~2 Hz
      if (fpsAccum >= 0.5) {
        currentFps = Math.round(fpsFrameCount / fpsAccum);
        fpsFrameCount = 0;
        fpsAccum = 0;
        updateHud();
      }
    }
  );
}

main().catch(console.error);
