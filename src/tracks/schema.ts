/**
 * Track data schema — types + validator.
 * Tracks are JSON files conforming to this schema.
 * All coordinates in tile units.
 */

// ─── Types ──────────────────────────────────────────────────────────

export type SurfaceKind = 'road' | 'offroad' | 'wall';

export interface TileDef {
  emoji?: string;
  surface: SurfaceKind;
  canopy?: boolean; // renders above cars
}

export interface Checkpoint {
  a: [number, number];
  b: [number, number];
}

export interface TrackData {
  id: string;
  name: string;
  description: string;
  tileSize: number;
  laps: number;
  grid: string[];
  tileset: Record<string, TileDef>;
  waypoints: [number, number][];
  checkpoints: Checkpoint[];
  startLine: Checkpoint;
  gridPositions: [number, number][];
}

// ─── Validator ──────────────────────────────────────────────────────

export type ValidationError = { field: string; message: string };

export function validateTrack(data: unknown): { ok: true; track: TrackData } | { ok: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  if (!data || typeof data !== 'object') {
    return { ok: false, errors: [{ field: 'root', message: 'Expected a JSON object' }] };
  }

  const t = data as Record<string, unknown>;

  // Required string fields
  for (const field of ['id', 'name', 'description']) {
    if (typeof t[field] !== 'string' || !t[field]) {
      errors.push({ field, message: `Missing or invalid "${field}"` });
    }
  }

  // tileSize
  if (typeof t.tileSize !== 'number' || t.tileSize <= 0) {
    errors.push({ field: 'tileSize', message: 'Must be a positive number' });
  }

  // laps
  if (typeof t.laps !== 'number' || t.laps < 1) {
    errors.push({ field: 'laps', message: 'Must be at least 1' });
  }

  // grid — must be non-empty array of equal-length strings
  if (!Array.isArray(t.grid) || t.grid.length === 0) {
    errors.push({ field: 'grid', message: 'Must be a non-empty array of strings' });
  } else {
    const colCount = t.grid[0].length;
    for (let i = 0; i < t.grid.length; i++) {
      if (typeof t.grid[i] !== 'string' || t.grid[i].length !== colCount) {
        errors.push({ field: `grid[${i}]`, message: `Row ${i} length must match row 0 (${colCount})` });
      }
    }
  }

  // tileset
  if (!t.tileset || typeof t.tileset !== 'object') {
    errors.push({ field: 'tileset', message: 'Missing tileset object' });
  }

  // waypoints
  if (!Array.isArray(t.waypoints) || t.waypoints.length < 2) {
    errors.push({ field: 'waypoints', message: 'Must have at least 2 waypoints' });
  }

  // checkpoints
  if (!Array.isArray(t.checkpoints) || t.checkpoints.length < 1) {
    errors.push({ field: 'checkpoints', message: 'Must have at least 1 checkpoint' });
  }

  // startLine
  if (!t.startLine || typeof t.startLine !== 'object') {
    errors.push({ field: 'startLine', message: 'Missing start line' });
  }

  // gridPositions
  if (!Array.isArray(t.gridPositions) || t.gridPositions.length === 0) {
    errors.push({ field: 'gridPositions', message: 'Must have at least 1 grid position' });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, track: data as unknown as TrackData };
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Gather all unique emojis referenced in a track's tileset. */
export function collectTrackEmojis(track: TrackData): string[] {
  const seen = new Set<string>();
  for (const key of Object.keys(track.tileset)) {
    const emoji = track.tileset[key].emoji;
    if (emoji) seen.add(emoji);
  }
  return [...seen];
}

/** Build sets for quick tile lookups. */
export function buildTrackLookups(track: TrackData) {
  const roadChars = new Set<string>();
  const offroadChars = new Set<string>();
  const wallChars = new Set<string>();
  const canopyChars = new Set<string>();

  for (const [char, def] of Object.entries(track.tileset)) {
    if (def.surface === 'road') roadChars.add(char);
    if (def.surface === 'offroad') offroadChars.add(char);
    if (def.surface === 'wall') wallChars.add(char);
    if (def.canopy) canopyChars.add(char);
  }

  // Tile → emoji mapping for rendering
  const emojiMap: Record<string, string> = {};
  for (const [char, def] of Object.entries(track.tileset)) {
    if (def.emoji) emojiMap[char] = def.emoji;
  }

  return { roadChars, offroadChars, wallChars, canopyChars, emojiMap };
}
