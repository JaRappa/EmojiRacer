/**
 * Track loader — validates & caches track JSON data.
 * Phase 1: Meadow Loop only. Desert Dash comes in Phase 3.
 */

import { TrackData, validateTrack } from './schema';
import meadowJson from './meadow.json';

const cache = new Map<string, TrackData>();

function register(raw: unknown): void {
  const result = validateTrack(raw);
  if (!result.ok) {
    const msgs = result.errors.map((e) => `  ${e.field}: ${e.message}`).join('\n');
    throw new Error(`Track validation failed:\n${msgs}`);
  }
  cache.set(result.track.id, result.track);
}

// Register built-in tracks
register(meadowJson);

export function loadTrack(id: string): TrackData {
  const track = cache.get(id);
  if (!track) throw new Error(`Unknown track: "${id}"`);
  return track;
}

export function listTracks(): TrackData[] {
  return [...cache.values()];
}
