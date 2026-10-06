import { describe, expect, it } from "vitest";
import {
  defaultRendererPrefs,
  loadRendererPrefs,
  prefsStorageKey,
  saveRendererPrefs,
} from "./rendererPrefs";
import type { PrefsStorage } from "./rendererPrefs";

function memoryStorage(initial: Record<string, string> = {}): PrefsStorage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

describe("renderer prefs", () => {
  it("returns the defaults without storage or stored data", () => {
    expect(loadRendererPrefs(null)).toEqual(defaultRendererPrefs);
    expect(loadRendererPrefs(memoryStorage())).toEqual(defaultRendererPrefs);
  });

  it("round-trips saved preferences", () => {
    const storage = memoryStorage();
    saveRendererPrefs(storage, {
      ...defaultRendererPrefs,
      autosaveEveryTicks: 0,
      showZones: false,
    });
    expect(loadRendererPrefs(storage)).toMatchObject({ autosaveEveryTicks: 0, showZones: false });
  });

  it("merges partial data and ignores invalid or unparsable data", () => {
    expect(
      loadRendererPrefs(memoryStorage({ [prefsStorageKey]: '{"toastBurstLimit":5}' })),
    ).toEqual({ ...defaultRendererPrefs, toastBurstLimit: 5 });
    expect(
      loadRendererPrefs(memoryStorage({ [prefsStorageKey]: '{"toastBurstLimit":-2}' })),
    ).toEqual(defaultRendererPrefs);
    expect(loadRendererPrefs(memoryStorage({ [prefsStorageKey]: "not json" }))).toEqual(
      defaultRendererPrefs,
    );
  });

  it("survives a storage that throws", () => {
    const broken: PrefsStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadRendererPrefs(broken)).toEqual(defaultRendererPrefs);
    expect(() => saveRendererPrefs(broken, defaultRendererPrefs)).not.toThrow();
  });
});
