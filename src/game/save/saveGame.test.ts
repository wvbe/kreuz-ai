import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { JsonValue } from "../engine/EventBus";
import { InvalidSaveFormatError } from "./InvalidSaveFormatError";
import { saveGame, serializeGame } from "./saveGame";
import { SaveSectionLocation } from "./SaveSectionRegistry";
import { defaultSaveTimestamp } from "./saveTypes";
import { createSaveWorld } from "./testSaveWorld";

describe("serializeGame", () => {
  it("contains exactly the DECISIONS D-05 root keys plus registered sections", () => {
    const world = createSaveWorld();
    world.pipeline.runTicks(5);
    const root = serializeGame(world.parts);
    expect(Object.keys(root).sort()).toEqual(
      [
        "version",
        "timestamp",
        "time",
        "prng",
        "eventQueue",
        "initOptions",
        "counters",
        "systems",
        "entities",
        "maps",
        "statuses",
      ].sort(),
    );
    expect(root["version"]).toBe(1);
    expect(root["timestamp"]).toBe(defaultSaveTimestamp);
    expect(root["systems"]).toEqual({ trade: { bells: 0 } });
  });

  it("uses the host-injected timestamp and rejects malformed ones", () => {
    const world = createSaveWorld();
    expect(serializeGame(world.parts, { timestamp: "2026-10-05T10:00:00.000Z" })["timestamp"]).toBe(
      "2026-10-05T10:00:00.000Z",
    );
    expect(() => serializeGame(world.parts, { timestamp: "now" })).toThrow(InvalidSaveFormatError);
  });

  it("rejects a section that produces state its own schema refuses", () => {
    const world = createSaveWorld();
    world.parts.sections.register({
      key: "broken",
      location: SaveSectionLocation.Systems,
      schema: z.number().int(),
      serialize: () => "oops",
      restore: () => undefined,
    });
    expect(() => serializeGame(world.parts)).toThrow(/systems.broken/);
  });

  it("is read-only: saving does not change the game", () => {
    const world = createSaveWorld();
    world.pipeline.runTicks(20);
    const before = saveGame(world.parts);
    saveGame(world.parts);
    expect(saveGame(world.parts)).toBe(before);
  });
});

describe("saveGame", () => {
  it("returns valid UTF-8 JSON text with canonical key order", () => {
    const world = createSaveWorld();
    world.pipeline.runTicks(12);
    const text = saveGame(world.parts);
    const parsed = JSON.parse(text) as { [key: string]: JsonValue };
    expect(Object.keys(parsed)).toEqual([...Object.keys(parsed)].sort());
    expect(new TextDecoder().decode(new TextEncoder().encode(text))).toBe(text);
    expect(text).not.toContain("\n");
  });

  it("gives identical text for identical state and differs only in the timestamp otherwise", () => {
    const first = createSaveWorld();
    const second = createSaveWorld();
    first.pipeline.runTicks(30);
    second.pipeline.runTicks(30);
    expect(saveGame(first.parts)).toBe(saveGame(second.parts));
    const stamped = saveGame(first.parts, { timestamp: "2026-01-01T00:00:00.000Z" });
    expect(stamped).not.toBe(saveGame(first.parts));
    expect(stamped.replace("2026-01-01T00:00:00.000Z", defaultSaveTimestamp)).toBe(
      saveGame(first.parts),
    );
  });

  it("captures in-flight tasks as plain records (spec 006 US1 AC2)", () => {
    const world = createSaveWorld();
    world.pipeline.runTicks(25);
    const text = saveGame(world.parts);
    expect(text).toContain('"TaskQueue"');
    expect(text).toContain('"waitFor"');
    expect(text).toContain('"token"');
  });
});
