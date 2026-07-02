# Emoji Racer — Engineering Handoff Plan

**Version:** 1.0 · **Date:** 2026-07-02 · **Status:** Ready for implementation

This document is a complete, self-contained specification for building Emoji Racer. An implementer (human or AI coding agent) should be able to build the singleplayer game from this document alone, without further product decisions. Decisions already made are marked **[DECIDED]**; anything genuinely open is in the Decision Log at the end.

---

## 1. Product summary

A top-down 2D browser racing game in the spirit of Micro Machines. All visual assets are emojis. Runs entirely client-side; hosted free on GitHub Pages. Singleplayer first (time trial, then AI opponents). Backend features (global leaderboard, ghost racing, multiplayer) are explicitly out of scope for v1 but the architecture must not block them.

**Success criteria for v1:** a player on desktop or mobile can load the page, pick a track, race 3 laps against 3 AI opponents at a stable 60 FPS, see their result and best lap, and have best times persist across visits.

---

## 2. Locked technical decisions

- **[DECIDED] Perspective:** top-down. No Mode 7 / pseudo-3D in v1. Depth is faked with drop shadows, speed-based camera zoom, and layered rendering (overhanging 🌴 canopies drawn above cars).
- **[DECIDED] Stack:** TypeScript + Vite, Canvas 2D API, no game engine, no runtime dependencies beyond Twemoji assets. Vitest for unit tests.
- **[DECIDED] Emoji rendering:** all emojis rasterized once at load time from **Twemoji SVG assets** onto offscreen canvases ("sprite cache"), never drawn via `fillText` in the game loop. This guarantees identical visuals on every OS and keeps per-frame cost to `drawImage` calls.
- **[DECIDED] Hosting/CI:** GitHub Pages, deployed by a GitHub Actions workflow on every push to `main`. Deployment is set up in Phase 0, before gameplay.
- **[DECIDED] Backend:** none in v1. Best times in `localStorage`. The persistence layer is wrapped in a small interface so a Lambda-backed leaderboard can be swapped in later without touching game code.
- **[DECIDED] Game loop:** fixed-timestep simulation at 60 Hz with an accumulator; rendering decoupled and interpolated. Physics must be identical on 60 Hz and 144 Hz displays.
- **[DECIDED] Tracks are data:** JSON files conforming to the schema in §5. No track logic hardcoded in the engine.

---

## 3. Repository layout

```
emoji-racer/
├── index.html
├── vite.config.ts
├── package.json
├── .github/workflows/deploy.yml     # build + deploy to Pages
├── public/
│   └── emoji/                       # vendored Twemoji SVGs used by the game
├── src/
│   ├── main.ts                      # bootstrap, screen manager
│   ├── engine/
│   │   ├── loop.ts                  # fixed-timestep loop
│   │   ├── input.ts                 # keyboard + touch abstraction
│   │   ├── sprites.ts               # emoji → offscreen-canvas cache
│   │   ├── camera.ts                # follow + speed zoom
│   │   └── audio.ts                 # WebAudio SFX
│   ├── game/
│   │   ├── car.ts                   # physics + state for one car
│   │   ├── ai.ts                    # waypoint-following driver
│   │   ├── race.ts                  # laps, checkpoints, positions, timer
│   │   ├── collision.ts             # circle vs AABB, car vs car
│   │   └── particles.ts             # 💨 💥 ✨
│   ├── tracks/
│   │   ├── schema.ts                # types + validator
│   │   ├── meadow.json
│   │   └── desert.json
│   ├── ui/
│   │   ├── screens.ts               # menu / race / results state machine
│   │   └── hud.ts                   # lap counter, timer, position
│   └── storage.ts                   # PersistenceProvider interface + localStorage impl
└── tests/                           # vitest unit tests (physics, laps, schema)
```

---

## 4. Core engine specification

### 4.1 Game loop

Fixed timestep `dt = 1/60 s`. On each animation frame: accumulate elapsed real time (clamped to 250 ms max to survive tab-switch), run `simulate(dt)` zero or more times, then `render(alpha)` where `alpha` is the accumulator remainder used to interpolate positions. All gameplay logic lives in `simulate`; `render` is pure and side-effect free.

### 4.2 Car physics (arcade model)

Each car is a point with position, heading, and scalar speed. Per simulation tick:

```
throttle input  → speed += ACCEL * dt            (up/W or touch-right)
brake/reverse   → speed -= BRAKE * dt            (down/S or touch-left)
always          → speed *= (1 - DRAG * dt)
steering        → heading += STEER * steerInput * dt * min(1, |speed| / GRIP_SPEED)
                  (cars cannot rotate in place; steering authority scales with speed)
off-road        → speed *= (1 - OFFROAD_DRAG * dt) additionally
position        += heading vector * speed * dt
```

Starting constants (tune from here, keep in one `constants.ts`):
`ACCEL = 220 px/s²`, `BRAKE = 320 px/s²`, `DRAG = 1.2 /s`, `OFFROAD_DRAG = 4.0 /s`, `MAX_SPEED = 340 px/s`, `STEER = 3.2 rad/s`, `GRIP_SPEED = 80 px/s`. World scale: 1 tile = 64 px; cars have collision radius 22 px and render at ~48 px.

**Drift boost (Phase 4):** holding steer at >80% max speed for 0.7 s charges a boost; releasing grants +25% max speed for 1.2 s and emits 💨 particles. Purely additive — the game must be complete and fun without it.

### 4.3 Collision

- Car vs wall tiles: circle vs AABB. Resolve by pushing the car out along the shallowest axis and reflecting the velocity component into the wall at 40% magnitude (a dampened bounce, not a hard stop).
- Car vs car: circle vs circle; separate both cars along the center line, split by mass equally, and exchange 30% of relative speed. No spin-outs in v1.

### 4.4 Sprite cache

At load, for every emoji the game uses, render its Twemoji SVG to an offscreen canvas at 2× display size (for crisp scaling) and store it in a `Map<emoji, HTMLCanvasElement>`. Rotation is applied at draw time via canvas transforms. Loading shows a minimal progress state; the game never calls `fillText` during play.

### 4.5 Camera

Camera follows the player with critically-damped smoothing (lerp factor ≈ `1 - exp(-6 * dt)`). Zoom interpolates from 1.15× at standstill to 0.85× at max speed. Camera is a render-only concern.

### 4.6 Input

Keyboard: arrows + WASD. Touch: left half of screen = steer (drag left/right from touch origin), right half = hold to accelerate, two-finger tap = brake. Input module exposes a normalized `{ throttle: -1..1, steer: -1..1 }` so gameplay code never sees raw events. Gamepad is a stretch goal, not required.

---

## 5. Track data schema

Tracks are JSON validated at load by `schema.ts` (fail loudly with the specific error). All coordinates in tile units.

```jsonc
{
  "id": "meadow",
  "name": "Meadow Loop",
  "tileSize": 64,
  "laps": 3,
  "grid": [                       // rows of single-char tile codes
    "TTTTTTTTTT",
    "TRRRRRRRRT",                 // R=road, G=grass, W=wall, T=tree(wall+canopy)
    "TRGGGGGGRT",
    "..."
  ],
  "tileset": {                    // tile code → emoji + behavior
    "R": { "emoji": "🛣️", "surface": "road" },
    "G": { "emoji": "🌱", "surface": "offroad" },
    "W": { "emoji": "🧱", "surface": "wall" },
    "T": { "emoji": "🌴", "surface": "wall", "canopy": true }
  },
  "waypoints": [ [4.5, 1.5], [8.5, 1.5], [8.5, 8.5], "..." ],   // ordered centerline, used by AI
  "checkpoints": [                // ordered gates; a lap counts only if all crossed in order
    { "a": [4, 1], "b": [4, 2] },
    { "a": [8, 4], "b": [9, 4] }
  ],
  "startLine": { "a": [4, 1], "b": [4, 2] },
  "grid_positions": [ [3.5, 1.3], [3.5, 1.7], [3.0, 1.3], [3.0, 1.7] ]   // starting spots
}
```

Rendering layers, bottom to top: surface tiles → tile shadows → oil/boost pads → car shadows → cars → particles → canopy tiles → HUD.

Ship two tracks in v1: **Meadow Loop** (wide, forgiving, the default) and **Desert Dash** (🌵 🏜️, tighter corners, one shortcut through slow sand).

---

## 6. Race rules

- Race = countdown (3️⃣ 2️⃣ 1️⃣ 🏁, inputs locked until GO) → N laps → results.
- **Lap validation:** each car tracks `nextCheckpointIndex`. Crossing the start line increments the lap only if all checkpoints were crossed in order that lap. Crossing checkpoints backward does nothing (index doesn't advance). This makes reverse-line cheating impossible by construction.
- **Position ranking:** sort by `(lapsCompleted, checkpointsPassedThisLap, -distanceToNextCheckpoint)` descending. Recompute every tick; display 🥇🥈🥉4️⃣.
- Timer shows current lap time and best lap. Results screen shows finishing order, total time, best lap, and whether a track record was set.
- Best-per-track lap and race times persist via `storage.ts`.

---

## 7. AI drivers

Each AI steers toward a target point: the next waypoint plus a fixed per-driver lateral offset (so they hold distinct lines). Steering input = clamped signed angle between heading and target direction. Throttle: full, except braking to a per-driver `cornerSpeed` when the angle to the target after next exceeds a threshold (simple corner anticipation). Per-driver personality = `{ maxSpeedFactor: 0.88–1.0, cornerSpeed, lateralOffset, name/emoji }`.

**Rubber-banding:** AI more than 1.5 checkpoints behind the player gets `maxSpeedFactor` +8%; more than 1.5 ahead, −8%. Recovery: an AI that hasn't advanced a checkpoint in 6 s is respawned at its last checkpoint facing the next waypoint (also apply to the player, via a "hold R to reset" input).

---

## 8. Delivery phases with acceptance criteria

Each phase ends deployed to GitHub Pages and demoable. Do not start a phase until the previous phase's criteria all pass.

**Phase 0 — Skeleton & pipeline (est. 1–2 days)**
Vite + TS project; CI deploys to Pages on push to `main`; fixed-timestep loop with an on-screen FPS/tick counter; sprite cache renders one 🏎️; keyboard drives the car on an empty field with the follow/zoom camera.
✅ *Accepts when:* live URL works on desktop Chrome/Firefox/Safari and one Android + one iOS phone; car control feels responsive; physics identical with monitor set to 60 Hz and 120+ Hz.

**Phase 1 — Track (est. 2–4 days)**
Track JSON loading + validation; tile rendering with layers; off-road slowdown; wall collision with dampened bounce; Meadow Loop playable.
✅ *Accepts when:* invalid track JSON fails with a clear message; driving on grass is visibly slower; hitting a wall never tunnels through at max speed; canopies draw over the car.

**Phase 2 — Time trial (est. 2–3 days)**
Countdown, lap/checkpoint logic, timer HUD, results screen, localStorage best times, minimal menu (track select → race → results → retry).
✅ *Accepts when:* driving backward over the line does not count a lap; skipping a checkpoint invalidates the lap; best time survives a page reload; a full menu→race→results→retry cycle works without reload.

**Phase 3 — AI race (est. 3–5 days)**
3 AI opponents with distinct personalities; live position ranking; car-vs-car collision; rubber-banding; stuck-recovery; Desert Dash added.
✅ *Accepts when:* all AI finish 3 laps on both tracks unassisted 10/10 runs; a mid-skill player can finish anywhere from 1st to 4th depending on performance; positions never flicker incorrectly at checkpoint boundaries.

**Phase 4 — Juice & mobile (est. 3–5 days)**
Touch controls; 💨 💥 ✨ particles; drift boost; WebAudio SFX (engine pitch by speed, collision, countdown, finish); screen shake on impact; pause; polish pass on menus.
✅ *Accepts when:* the game is fully playable one-handed... no — two-thumbed on a phone in portrait or landscape; audio starts only after first user gesture (browser autoplay rules); 60 FPS held on a mid-range phone with 4 cars + particles.

**Phase 5 — v1 release (est. 1–2 days)**
README with a play link and GIF; favicon 🏁; social/OG meta tags; final QA pass (checklist §10); tag `v1.0.0`.

---

## 9. Performance budgets

60 FPS on a mid-range phone (e.g., a 3-year-old Android) is the bar. Budgets: ≤ 4 ms simulate, ≤ 8 ms render per frame. Rules that keep it: no `fillText`/`measureText` in the loop; no allocation in the hot path (reuse vectors, pool particles ≤ 200 live); cull tiles outside the camera view; single canvas, no DOM churn during a race (HUD may be DOM but updates at most 10×/s). If render exceeds budget, first lever is pre-compositing the static track to one large offscreen canvas per zoom bucket.

---

## 10. QA checklist (run before every phase sign-off)

Browsers: latest Chrome, Firefox, Safari desktop; iOS Safari; Android Chrome. Checks: no console errors; resize/rotate mid-race doesn't break layout; tab-switch mid-race pauses cleanly and doesn't cause a physics jump on return; refresh mid-race returns to menu without corrupted storage; localStorage disabled (private mode) degrades gracefully to session-only bests; page weight ≤ 1.5 MB gzipped; Lighthouse performance ≥ 90 on the menu screen.

---

## 11. Future phases (design constraints only — do not build in v1)

- **Global leaderboard:** API Gateway + Lambda + DynamoDB behind the existing `PersistenceProvider` interface. Treat as casual (client-submitted times are spoofable); reject sub-humanly-fast laps server-side.
- **Ghost racing:** record per-tick inputs + start seed during runs (the deterministic fixed-timestep loop makes replays exact). Cap replay size (~3 laps of inputs is tiny). Upload alongside leaderboard entries; race a translucent 👻 car. This is the highest-value multiplayer-feeling feature and needs no realtime infra.
- **Realtime multiplayer:** not Lambda-shaped. Evaluate Cloudflare Durable Objects or a small Fly.io WebSocket server when the time comes. The deterministic sim + input-based replays built for ghosts are exactly the foundation lockstep or rollback netcode needs — build ghosts first.

**Non-goals for v1:** accounts, mobile app wrappers, track editor, gamepad support, Mode 7 renderer (possible later as an alternate renderer over the same track data).

---

## 12. Decision log / open items

| # | Item | Status |
|---|------|--------|
| 1 | Twemoji license attribution (CC-BY 4.0) must appear in README + footer | To do in Phase 0 |
| 2 | Number of AI opponents (3 chosen for phone performance headroom) | Decided; revisit after Phase 4 profiling |
| 3 | Item pickups (⚡ boost, 🛢️ oil) | Deferred; oil-slick tile exists in schema via pads layer, mechanics post-v1 |
| 4 | Repo name / game title | Owner to choose before Phase 0 |
