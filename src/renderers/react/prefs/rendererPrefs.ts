import { z } from "zod";

/**
 * Renderer preferences (spec 024, DECISIONS D-100): kept in the browser, never in a save and
 * never part of the game state.
 */
export type RendererPrefs = {
  /**
   * Autosave every N game ticks; 0 turns it off.
   */
  autosaveEveryTicks: number;
  /**
   * Toasts folded into "N more tidings" beyond this many per game hour (spec 024 FR-040).
   */
  toastBurstLimit: number;
  /**
   * Reason kinds (`MissingInput`, ...) whose `status.blocked` toasts the player turned off
   * (spec 024 FR-028).
   */
  mutedBlockedReasons: string[];
  /**
   * Draw the blocked/idle badges over the map.
   */
  showBadges: boolean;
  /**
   * Draw the zone overlay.
   */
  showZones: boolean;
};

/**
 * What a fresh browser starts with: autosave once per game day (288 ticks).
 */
export const defaultRendererPrefs: RendererPrefs = {
  autosaveEveryTicks: 288,
  toastBurstLimit: 3,
  mutedBlockedReasons: [],
  showBadges: true,
  showZones: true,
};

/**
 * The storage key of the preferences.
 */
export const prefsStorageKey = "kreuzvibe.prefs";

/**
 * The part of the Web Storage API the renderer uses; tests pass an in-memory one.
 */
export type PrefsStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

const prefsSchema = z
  .object({
    autosaveEveryTicks: z.number().int().min(0).max(1_000_000),
    toastBurstLimit: z.number().int().min(0).max(100),
    mutedBlockedReasons: z.array(z.string()),
    showBadges: z.boolean(),
    showZones: z.boolean(),
  })
  .partial();

/**
 * Reads the preferences; anything missing or invalid falls back to the defaults, and a storage
 * that throws (private window, blocked site data) is treated as empty.
 *
 * @param storage - The storage, or null when the browser has none.
 * @returns The preferences in force.
 */
export function loadRendererPrefs(storage: PrefsStorage | null): RendererPrefs {
  try {
    const text = storage?.getItem(prefsStorageKey) ?? null;
    if (text === null) {
      return { ...defaultRendererPrefs };
    }
    const parsed = prefsSchema.safeParse(JSON.parse(text));
    return parsed.success
      ? { ...defaultRendererPrefs, ...parsed.data }
      : { ...defaultRendererPrefs };
  } catch {
    return { ...defaultRendererPrefs };
  }
}

/**
 * Writes the preferences; a failing storage is ignored (the preferences then last one session).
 *
 * @param storage - The storage, or null.
 * @param prefs - The preferences to keep.
 */
export function saveRendererPrefs(storage: PrefsStorage | null, prefs: RendererPrefs): void {
  try {
    storage?.setItem(prefsStorageKey, JSON.stringify(prefs));
  } catch {
    // Storage may be full or blocked; preferences are a convenience only.
  }
}
