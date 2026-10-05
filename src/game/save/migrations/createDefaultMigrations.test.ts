import { describe, expect, it } from "vitest";
import { currentSaveVersion } from "../saveTypes";
import { createDefaultMigrations } from "./createDefaultMigrations";

describe("createDefaultMigrations", () => {
  it("covers every version from 0 up to the current save version", () => {
    expect(createDefaultMigrations().covers(0, currentSaveVersion)).toBe(true);
  });

  it("returns independent registries", () => {
    const first = createDefaultMigrations();
    const second = createDefaultMigrations();
    first.register({ fromVersion: currentSaveVersion, description: "x", migrate: (root) => root });
    expect(first.covers(0, currentSaveVersion + 1)).toBe(true);
    expect(second.covers(0, currentSaveVersion + 1)).toBe(false);
  });

  it("migrates a version 0 root all the way", () => {
    const migrated = createDefaultMigrations().migrate({ version: 0 }, 0, currentSaveVersion);
    expect(migrated["version"]).toBe(currentSaveVersion);
  });
});
