import { describe, it, expect, beforeEach } from 'vitest';
import { createLocalStoragePersistence } from '../src/storage';

// Mock localStorage since we're not using jsdom
const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
});

(globalThis as Record<string, unknown>).localStorage = {
  getItem: (key: string): string | null => store.get(key) ?? null,
  setItem: (key: string, value: string): void => { store.set(key, value); },
  removeItem: (key: string): void => { store.delete(key); },
  clear: (): void => { store.clear(); },
  get length(): number { return store.size; },
  key: (index: number): string | null => {
    const keys = [...store.keys()];
    return keys[index] ?? null;
  },
};

describe('Storage', () => {
  it('returns null when no time saved', () => {
    const storage = createLocalStoragePersistence();
    expect(storage.getBestLapTime('nonexistent')).toBeNull();
    expect(storage.getBestRaceTime('nonexistent')).toBeNull();
  });

  it('saves and retrieves best times', () => {
    const storage = createLocalStoragePersistence();
    storage.saveBestLapTime({ trackId: 'test', timeMs: 50000, date: '2026-01-01' });
    storage.saveBestRaceTime({ trackId: 'test', timeMs: 180000, date: '2026-01-01' });

    expect(storage.getBestLapTime('test')?.timeMs).toBe(50000);
    expect(storage.getBestRaceTime('test')?.timeMs).toBe(180000);
  });

  it('only keeps the best (lowest) time', () => {
    const storage = createLocalStoragePersistence();
    storage.saveBestLapTime({ trackId: 'test', timeMs: 50000, date: '2026-01-01' });
    storage.saveBestLapTime({ trackId: 'test', timeMs: 60000, date: '2026-01-02' }); // worse
    expect(storage.getBestLapTime('test')?.timeMs).toBe(50000);

    storage.saveBestLapTime({ trackId: 'test', timeMs: 40000, date: '2026-01-03' }); // better
    expect(storage.getBestLapTime('test')?.timeMs).toBe(40000);
  });
});
