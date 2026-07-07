/**
 * Emoji Racer — bootstrap & game runner.
 * Phase 1: Menu system + track loading & emoji tile rendering.
 */

import { startLoop } from './engine/loop';
import { initInput, InputState } from './engine/input';
import { applyCamera, removeCamera, createCamera, CameraState } from './engine/camera';
import { drawSprite, preloadSprites, getSpriteBounds } from './engine/sprites';
import { createCar, simulateCar, resolveWallCollision, isPointOnRoad, CarState } from './game/car';
import { PLAYER_EMOJI, MAX_SPEED, EMOJI_SIZE, TILE_SIZE, COLOR_GRASS } from './game/constants';
import { drawMinimap } from './ui/minimap';
import { createJoystick, isTouchDevice, JoystickHandle, JoystickInput } from './ui/joystick';
import { initScreens, getScreen, Screen, navigate } from './ui/screens';
import { loadTrack } from './tracks/loader';
import { TrackData, TileDef } from './tracks/schema';
import { collectTrackEmojis } from './tracks/schema';

// ─── Globals ────────────────────────────────────────────────────────
const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const hud = document.getElementById('hud')!;
const backToMenuBtn = document.getElementById('back-to-menu') as HTMLButtonElement;

let player: CarState;
let camera: { state: CameraState; update: (tx: number, ty: number, speed: number, maxSpeed: number, dt: number) => void };
let input: InputState = { throttle: 0, steer: 0 };
let joystick: JoystickHandle | null = null;

// FPS tracking
let currentFps = 0;

// ─── Track state (loaded per race) ──────────────────────────────────
let track: TrackData;
let grid: string[][] = [];
let roadChars = new Set<string>();
let wallChars = new Set<string>();
let canopyChars = new Set<string>();
let tileEmoji: Record<string, string> = {};
let tileColor: Record<string, string> = {};

function loadTrackState(id: string): void {
  track = loadTrack(id);

  grid = track.grid.map((row) => [...row]);

  roadChars.clear();
  wallChars.clear();
  canopyChars.clear();
  tileEmoji = {};
  tileColor = {};

  for (const [code, def] of Object.entries(track.tileset)) {
    if (def.emoji) {
      tileEmoji[code] = def.emoji;
    }
    if (def.surface === 'road') {
      roadChars.add(code);
      tileColor[code] = '#555555';
    } else if (def.surface === 'offroad') {
      tileColor[code] = '#8B6914';
    } else if (def.surface === 'wall') {
      wallChars.add(code);
      tileColor[code] = '#cc3333';
    }
    if (def.canopy) canopyChars.add(code);
  }
}

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

  // Determine surface from actual track tile
  const onRoad = isPointOnRoad(player.x, player.y, grid, roadChars);

  // Simulate physics
  simulateCar(player, dt, onRoad);

  // Wall collision
  resolveWallCollision(player, grid, wallChars);

  // Update camera
  camera.update(player.x, player.y, player.speed, MAX_SPEED, dt);
}

// ─── Rendering ──────────────────────────────────────────────────────

function drawTileLayer(camObj: CameraState): void {
  const cam = camObj;
  const viewW = canvas.width / (window.devicePixelRatio || 1);
  const viewH = canvas.height / (window.devicePixelRatio || 1);

  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  if (rows === 0 || cols === 0) return;

  const halfViewW = viewW / cam.zoom / 2;
  const halfViewH = viewH / cam.zoom / 2;
  const minCol = Math.max(0, Math.floor((cam.x - halfViewW) / TILE_SIZE));
  const maxCol = Math.min(cols - 1, Math.ceil((cam.x + halfViewW) / TILE_SIZE));
  const minRow = Math.max(0, Math.floor((cam.y - halfViewH) / TILE_SIZE));
  const maxRow = Math.min(rows - 1, Math.ceil((cam.y + halfViewH) / TILE_SIZE));

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const code = grid[row]?.[col];
      if (!code) continue;

      const emoji = tileEmoji[code];
      const color = tileColor[code];
      const px = col * TILE_SIZE + TILE_SIZE / 2;
      const py = row * TILE_SIZE + TILE_SIZE / 2;

      if (emoji) {
        // Draw emoji sprite centered on tile (no rotation)
        drawSprite(ctx, emoji, px, py, 0, TILE_SIZE);
      } else if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  }
}

function drawCanopyLayer(camObj: CameraState): void {
  if (canopyChars.size === 0) return;

  const cam = camObj;
  const viewW = canvas.width / (window.devicePixelRatio || 1);
  const viewH = canvas.height / (window.devicePixelRatio || 1);

  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  if (rows === 0 || cols === 0) return;

  const halfViewW = viewW / cam.zoom / 2;
  const halfViewH = viewH / cam.zoom / 2;
  const minCol = Math.max(0, Math.floor((cam.x - halfViewW) / TILE_SIZE));
  const maxCol = Math.min(cols - 1, Math.ceil((cam.x + halfViewW) / TILE_SIZE));
  const minRow = Math.max(0, Math.floor((cam.y - halfViewH) / TILE_SIZE));
  const maxRow = Math.min(rows - 1, Math.ceil((cam.y + halfViewH) / TILE_SIZE));

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const code = grid[row]?.[col];
      if (!code || !canopyChars.has(code)) continue;

      const emoji = tileEmoji[code];
      if (!emoji) continue;

      const px = col * TILE_SIZE + TILE_SIZE / 2;
      const py = row * TILE_SIZE + TILE_SIZE / 2;

      // Slightly larger and offset for canopy effect
      drawSprite(ctx, emoji, px, py - 4, 0, TILE_SIZE);
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

  // Layer 1: surface tiles (road, grass, walls)
  drawTileLayer(camera.state);

  // Layer 3: car (with shadow would be layer 2, added in Phase 4)
  drawSprite(ctx, PLAYER_EMOJI, player.x, player.y, player.heading, EMOJI_SIZE);

  // Layer 6: canopy tiles drawn above cars
  drawCanopyLayer(camera.state);

  removeCamera(ctx);

  // Draw minimap in screen-space (top-right corner)
  const dpr2 = window.devicePixelRatio || 1;
  drawMinimap(ctx, grid, tileColor, player, canvas.width / dpr2);

  // Draw virtual joystick (touch devices only)
  if (joystick) {
    joystick.render(ctx);
  }
}

function updateHud(): void {
  const speed = Math.abs(player.speed);
  const speedKmh = Math.round(speed * 3.6 / 100);
  hud.textContent = `FPS: ${currentFps} | Speed: ${speedKmh} km/h`;
}

// ─── Main ───────────────────────────────────────────────────────────

let stopGameLoop: (() => void) | null = null;
let gameRunning = false;

function startGame(trackId: string): void {
  if (gameRunning) return;

  // Load track state
  loadTrackState(trackId);

  // Preload track tile emojis before starting
  const emojis = collectTrackEmojis(track);
  preloadSprites([PLAYER_EMOJI, ...emojis]).then(() => {
    if (!gameRunning && getScreen().kind !== 'race') return; // user already navigated away

    gameRunning = true;

    // Show canvas and back button
    canvas.style.display = 'block';
    hud.style.display = 'block';
    backToMenuBtn.style.display = 'block';

    // Init simulation state
    initSimulation();

    // FPS tracking
    let fpsFrameCount = 0;
    let fpsAccum = 0;
    let lastTime = 0;

    stopGameLoop = startLoop(
      (dt) => {
        simulate(dt);
      },
      (_alpha) => {
        const now = performance.now() / 1000;
        if (lastTime > 0) {
          fpsAccum += now - lastTime;
          fpsFrameCount++;
        }
        lastTime = now;

        render(_alpha);

        if (fpsAccum >= 0.5) {
          currentFps = Math.round(fpsFrameCount / fpsAccum);
          fpsFrameCount = 0;
          fpsAccum = 0;
          updateHud();
        }
      }
    );
  });
}

function stopGame(): void {
  if (stopGameLoop) {
    stopGameLoop();
    stopGameLoop = null;
  }
  gameRunning = false;

  // Clean up input
  destroyInput?.();
  destroyInput = null;

  // Clean up joystick
  if (joystick) {
    joystick.destroy();
    joystick = null;
  }

  canvas.style.display = 'none';
  hud.style.display = 'none';
  backToMenuBtn.style.display = 'none';
}

function initSimulation(): void {
  // Use track's first grid position as player starting spot
  const startPos = track.gridPositions[0];
  const startX = startPos[0] * TILE_SIZE;
  const startY = startPos[1] * TILE_SIZE;

  // Determine starting heading from the first two waypoints
  const wp0 = track.waypoints[0];
  const wp1 = track.waypoints[1];
  const startHeading = Math.atan2(
    (wp1[1] - wp0[1]) * TILE_SIZE,
    (wp1[0] - wp0[0]) * TILE_SIZE,
  );

  player = createCar({
    startX,
    startY,
    startHeading,
    halfWidth: spriteBounds?.halfWidth,
    halfLength: spriteBounds?.halfLength,
  });

  // Create camera
  const camObj = createCamera();
  camera = camObj;
  camObj.update(player.x, player.y, 0, MAX_SPEED, 1);
  camera.state.x = player.x;
  camera.state.y = player.y;

  // Init input
  const onTouch = isTouchDevice();
  destroyInput = initInput(canvas, (s) => { input = s; }, { disableTouch: onTouch });

  // Init joystick on touch devices
  if (onTouch) {
    joystick = createJoystick(canvas, (j: JoystickInput) => {
      input = { throttle: j.throttle, steer: j.steer };
    });
  }
}

let spriteBounds: { halfWidth: number; halfLength: number } | null = null;
let destroyInput: (() => void) | null = null;

async function main(): Promise<void> {
  resize();

  // Preload sprites
  await preloadSprites([PLAYER_EMOJI]);

  // Compute hitbox from actual sprite content
  spriteBounds = getSpriteBounds(PLAYER_EMOJI);

  // Start with canvas hidden (only shown during sandbox)
  canvas.style.display = 'none';
  hud.style.display = 'none';

  // Init screen state machine
  const screensContainer = document.getElementById('screens')!;
  initScreens(screensContainer, (screen: Screen) => {
    if (screen.kind === 'race') {
      startGame(screen.trackId);
    } else {
      stopGame();
    }
  });

  // Escape key or back button → return to menu
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && getScreen().kind === 'race') {
      navigate({ kind: 'menu' });
    }
  });
  backToMenuBtn.addEventListener('click', () => {
    if (getScreen().kind === 'race') {
      navigate({ kind: 'menu' });
    }
  });

  // If opening directly to race (query param in future), start game
  const screen = getScreen();
  if (screen.kind === 'race') {
    startGame(screen.trackId);
  }
}

main().catch(console.error);
