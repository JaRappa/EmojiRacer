/**
 * Storage interface — persistence layer for best times.
 * localStorage implementation; can be swapped for Lambda-backed leaderboard later.
 */

export interface BestTime {
  trackId: string;
  timeMs: number;
  date: string;
}

export interface PersistenceProvider {
  getBestLapTime(trackId: string): BestTime | null;
  getBestRaceTime(trackId: string): BestTime | null;
  saveBestLapTime(entry: BestTime): void;
  saveBestRaceTime(entry: BestTime): void;
}

const LAP_PREFIX = 'emojiracer_lap_';
const RACE_PREFIX = 'emojiracer_race_';

export function createLocalStoragePersistence(): PersistenceProvider {
  function get(key: string): BestTime | null {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw) as BestTime;
    } catch {
      return null;
    }
  }

  function set(key: string, entry: BestTime): void {
    try {
      localStorage.setItem(key, JSON.stringify(entry));
    } catch {
      // Storage full or disabled — silently ignore
    }
  }

  return {
    getBestLapTime(trackId: string): BestTime | null {
      return get(LAP_PREFIX + trackId);
    },
    getBestRaceTime(trackId: string): BestTime | null {
      return get(RACE_PREFIX + trackId);
    },
    saveBestLapTime(entry: BestTime): void {
      const existing = this.getBestLapTime(entry.trackId);
      if (!existing || entry.timeMs < existing.timeMs) {
        set(LAP_PREFIX + entry.trackId, entry);
      }
    },
    saveBestRaceTime(entry: BestTime): void {
      const existing = this.getBestRaceTime(entry.trackId);
      if (!existing || entry.timeMs < existing.timeMs) {
        set(RACE_PREFIX + entry.trackId, entry);
      }
    },
  };
}
