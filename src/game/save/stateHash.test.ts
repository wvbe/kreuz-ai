import { describe, expect, it } from "vitest";
import { InvalidSaveFormatError } from "./InvalidSaveFormatError";
import { saveGame } from "./saveGame";
import { hashGameState, hashSaveText, hashText } from "./stateHash";
import { createSaveWorld } from "./testSaveWorld";

describe("hashText", () => {
  it("is stable, 16 hex characters and sensitive to every character", () => {
    expect(hashText("")).toBe(hashText(""));
    expect(hashText("abc")).toMatch(/^[0-9a-f]{16}$/);
    expect(hashText("abc")).not.toBe(hashText("abd"));
    expect(hashText("ab")).not.toBe(hashText("ba"));
  });

  it("has committed golden values", () => {
    expect(hashText("")).toBe("811c9dc501000193");
    expect(hashText("a")).toBe("e40c292cefa8b958");
    expect(hashText("kreuzvibe")).toBe("da706418d093f206");
  });
});

describe("hashSaveText", () => {
  it("ignores the timestamp", () => {
    const world = createSaveWorld();
    world.pipeline.runTicks(10);
    const early = saveGame(world.parts, { timestamp: "2026-01-01T00:00:00.000Z" });
    const late = saveGame(world.parts, { timestamp: "2030-06-01T08:30:00.000Z" });
    expect(early).not.toBe(late);
    expect(hashSaveText(early)).toBe(hashSaveText(late));
  });

  it("changes when state changes", () => {
    const world = createSaveWorld();
    const before = hashSaveText(saveGame(world.parts));
    world.pipeline.runTicks(1);
    expect(hashSaveText(saveGame(world.parts))).not.toBe(before);
  });

  it("rejects text that is not a JSON object", () => {
    expect(() => hashSaveText("nope")).toThrow(InvalidSaveFormatError);
    expect(() => hashSaveText("[1]")).toThrow(/not an object/);
  });
});

describe("hashGameState", () => {
  it("equals the hash of the saved text and is equal for equal runs", () => {
    const first = createSaveWorld();
    const second = createSaveWorld();
    first.pipeline.runTicks(15);
    second.pipeline.runTicks(15);
    expect(hashGameState(first.parts)).toBe(hashGameState(second.parts));
    expect(hashGameState(first.parts)).toBe(hashSaveText(saveGame(first.parts)));
  });
});
