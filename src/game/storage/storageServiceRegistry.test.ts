import { describe, expect, it } from "vitest";
import { createAiWorld } from "../ai/testAiWorld";
import { StorageService } from "./StorageService";
import { bindStorageService, getStorageService } from "./storageServiceRegistry";

describe("getStorageService", () => {
  it("returns the service the engine registered for itself", () => {
    const { engine } = createAiWorld();
    expect(getStorageService(engine)).toBeInstanceOf(StorageService);
    expect(getStorageService(engine)).toBe(getStorageService(engine));
  });

  it("keeps one service per engine", () => {
    expect(getStorageService(createAiWorld().engine)).not.toBe(
      getStorageService(createAiWorld().engine),
    );
  });
});

describe("bindStorageService", () => {
  it("replaces the service of an engine", () => {
    const { engine } = createAiWorld();
    const other = new StorageService(engine);
    bindStorageService(engine, other);
    expect(getStorageService(engine)).toBe(other);
  });
});
