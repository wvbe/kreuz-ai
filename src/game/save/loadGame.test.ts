import { describe, expect, it } from "vitest";
import type { JsonValue } from "../engine/EventBus";
import { CounterName } from "../engine/IdCounters";
import { InvalidSaveFormatError } from "./InvalidSaveFormatError";
import { loadGame } from "./loadGame";
import { saveGame } from "./saveGame";
import { SaveSectionLocation } from "./SaveSectionRegistry";
import { z } from "zod";
import { currentSaveVersion } from "./saveTypes";
import { hashGameState } from "./stateHash";
import { createSaveWorld, worldTotalTicks } from "./testSaveWorld";
import { UnsupportedSaveVersionError } from "./UnsupportedSaveVersionError";

type Root = { [key: string]: JsonValue };

function savedAt(ticks: number): { text: string; root: Root } {
  const world = createSaveWorld();
  world.pipeline.runTicks(ticks);
  const text = saveGame(world.parts);
  return { text, root: JSON.parse(text) as Root };
}

describe("loadGame", () => {
  it("restores everything: save(load(save(x))) equals save(x)", () => {
    const { text } = savedAt(45);
    const target = createSaveWorld(7);
    const result = loadGame(text, target.parts);
    expect(result).toEqual({
      originalVersion: currentSaveVersion,
      migrated: false,
      timestamp: "1970-01-01T00:00:00.000Z",
    });
    expect(saveGame(target.parts)).toBe(text);
    expect(target.ledger).toEqual({ ticksSeen: 45, bells: 2 });
  });

  it("accepts an already parsed object", () => {
    const { text, root } = savedAt(20);
    const target = createSaveWorld(3);
    loadGame(root, target.parts);
    expect(saveGame(target.parts)).toBe(text);
  });

  it("rebuilds the occupant index from Position components (spec 006 SC-007)", () => {
    const { text } = savedAt(40);
    const target = createSaveWorld();
    loadGame(text, target.parts);
    for (const entity of target.parts.store.entities()) {
      const position = entity.components["Position"] as { mapId: number; cellIndex: number };
      expect(target.parts.maps.queryCell(position.mapId, position.cellIndex).occupants).toContain(
        entity.id,
      );
    }
  });

  it("keeps the PRNG continuing mid-sequence (SC-006)", () => {
    const original = createSaveWorld();
    original.pipeline.runTicks(33);
    const text = saveGame(original.parts);
    const expected = original.parts.prng.prng.stream("wander").nextInt(0, 1_000_000);
    const target = createSaveWorld(99);
    loadGame(text, target.parts);
    expect(target.parts.prng.prng.stream("wander").nextInt(0, 1_000_000)).toBe(expected);
  });

  it("continuing after load equals the uninterrupted run (SC-003)", () => {
    const reference = createSaveWorld();
    reference.pipeline.runTicks(worldTotalTicks);
    const split = createSaveWorld();
    split.pipeline.runTicks(60);
    const resumed = createSaveWorld(5);
    loadGame(saveGame(split.parts), resumed.parts);
    resumed.pipeline.runTicks(worldTotalTicks - 60);
    expect(hashGameState(resumed.parts)).toBe(hashGameState(reference.parts));
    expect(saveGame(resumed.parts)).toBe(saveGame(reference.parts));
  });

  it("migrates an older save and reports it", () => {
    const { root } = savedAt(10);
    const old: Root = { ...root, version: 0 };
    delete old["counters"];
    delete old["systems"];
    old["initOptions"] = { ...(root["initOptions"] as Root), difficulty: "hard" };
    const target = createSaveWorld(8);
    const result = loadGame(old, target.parts);
    expect(result.migrated).toBe(true);
    expect(result.originalVersion).toBe(0);
    expect(target.parts.initOptions.options.difficulty).toBe("harsh");
    expect(target.parts.counters.peek(CounterName.EntityId)).toBe(4);
    expect(target.ledger.bells).toBe(0);
  });

  describe("rejection leaves the running game untouched (SC-004)", () => {
    function expectRejected(
      input: string | JsonValue,
      errorType: abstract new (...args: never[]) => Error,
    ): void {
      const target = createSaveWorld();
      target.pipeline.runTicks(12);
      const before = saveGame(target.parts);
      expect(() => loadGame(input, target.parts)).toThrow(errorType);
      expect(saveGame(target.parts)).toBe(before);
    }

    it("invalid and truncated JSON", () => {
      const { text } = savedAt(5);
      expectRejected("{nope", InvalidSaveFormatError);
      expectRejected(text.slice(0, 100), InvalidSaveFormatError);
    });

    it("newer versions", () => {
      const { root } = savedAt(5);
      expectRejected({ ...root, version: currentSaveVersion + 1 }, UnsupportedSaveVersionError);
    });

    it("validation failures", () => {
      const { root } = savedAt(5);
      expectRejected({ ...root, entities: "many" }, InvalidSaveFormatError);
    });

    it("unknown root keys", () => {
      const { root } = savedAt(5);
      expectRejected({ ...root, extra: 1 }, InvalidSaveFormatError);
    });

    it("content that parses but cannot be applied: unknown prototype, bad component, counter clash", () => {
      const { root } = savedAt(30);
      const entities = root["entities"] as Root[];
      const first = entities[0] as Root;
      expectRejected(
        { ...root, entities: [{ ...first, prototype: "dragon" }, ...entities.slice(1)] },
        InvalidSaveFormatError,
      );
      expectRejected(
        {
          ...root,
          entities: [
            { ...first, components: { ...(first["components"] as Root), Errands: { bogus: 1 } } },
            ...entities.slice(1),
          ],
        },
        InvalidSaveFormatError,
      );
      expectRejected(
        { ...root, counters: { ...(root["counters"] as Root), nextEntityId: 1 } },
        InvalidSaveFormatError,
      );
    });

    it("a position on a map that does not exist", () => {
      const { root } = savedAt(30);
      const entities = root["entities"] as Root[];
      const first = entities[0] as Root;
      const components = first["components"] as Root;
      expectRejected(
        {
          ...root,
          entities: [
            { ...first, components: { ...components, Position: { mapId: 9, cellIndex: 0 } } },
            ...entities.slice(1),
          ],
        },
        InvalidSaveFormatError,
      );
    });

    it("an unknown terrain id in a map", () => {
      const { root } = savedAt(30);
      const maps = root["maps"] as Root[];
      const first = maps[0] as Root;
      const cells = (first["cells"] as Root[]).map((cell, index) =>
        index === 0 ? { terrain: "lava" } : cell,
      );
      expectRejected(
        { ...root, maps: [{ ...first, cells }, ...maps.slice(1)] },
        InvalidSaveFormatError,
      );
    });
  });

  it("wraps non-save errors thrown while applying as InvalidSaveFormatError with the cause", () => {
    const { root } = savedAt(5);
    const target = createSaveWorld();
    const entities = root["entities"] as Root[];
    try {
      loadGame({ ...root, entities: [...entities.slice(0, 1), entities[0] as Root] }, target.parts);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidSaveFormatError);
      expect((error as InvalidSaveFormatError).cause).toBeInstanceOf(Error);
    }
  });

  it("passes section restore failures through the same rollback", () => {
    const { text } = savedAt(8);
    const target = createSaveWorld();
    let failures = 1;
    target.parts.sections.register({
      key: "fragile",
      location: SaveSectionLocation.Systems,
      schema: z.number().int(),
      defaultForOlderSaves: () => 0,
      serialize: () => 0,
      restore: () => {
        if (failures > 0) {
          failures -= 1;
          throw new Error("section exploded");
        }
      },
    });
    const old = JSON.parse(text) as Root;
    old["systems"] = { ...(old["systems"] as Root), fragile: 0 };
    const before = saveGame(target.parts);
    expect(() => loadGame(old, target.parts)).toThrow(/section exploded/);
    expect(saveGame(target.parts)).toBe(before);
  });

  it("reports when even the rollback fails", () => {
    const { root } = savedAt(8);
    const target = createSaveWorld();
    target.parts.sections.register({
      key: "doomed",
      location: SaveSectionLocation.Root,
      schema: z.number().int(),
      serialize: () => 0,
      restore: () => {
        throw new Error("never works");
      },
    });
    expect(() => loadGame({ ...root, doomed: 0 }, target.parts)).toThrow(/could not be restored/);
  });
});
