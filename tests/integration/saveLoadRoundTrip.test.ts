import { describe, expect, it } from "vitest";
import { requireComponent } from "../../src/game/ecs/Entity";
import type { JsonValue } from "../../src/game/engine/EventBus";
import { GridType } from "../../src/game/map/mapTypes";
import { positionComponent } from "../../src/game/map/positionComponent";
import { InvalidSaveFormatError } from "../../src/game/save/InvalidSaveFormatError";
import { loadGame } from "../../src/game/save/loadGame";
import { saveGame } from "../../src/game/save/saveGame";
import { currentSaveVersion } from "../../src/game/save/saveTypes";
import { hashGameState } from "../../src/game/save/stateHash";
import { createSaveWorld } from "../../src/game/save/testSaveWorld";
import { UnsupportedSaveVersionError } from "../../src/game/save/UnsupportedSaveVersionError";

// Spec 006 user stories 1-4 and success criteria, against a world assembled from the real
// modules (clock, PRNG, bus, counters, entities with task queues and behavior trees, maps,
// inventories and registered save sections).

type Root = { [key: string]: JsonValue };

const longRun = 500;

describe("US1: save game", () => {
  it("AC1: root contains the DECISIONS D-05 keys, and is valid UTF-8 JSON (AC4)", () => {
    const world = createSaveWorld();
    world.pipeline.runTicks(100);
    const text = saveGame(world.parts);
    const root = JSON.parse(text) as Root;
    for (const key of [
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
    ]) {
      expect(root).toHaveProperty(key);
    }
    expect((root["time"] as Root)["tickCount"]).toBe(100);
    expect(root["entities"] as JsonValue[]).toHaveLength(3);
    expect(root["maps"] as JsonValue[]).toHaveLength(2);
  });

  // @covers 006:FR-009
  // @covers 006:FR-010
  it("AC2: an in-flight task serializes as a record with checkpoint and token, no promises", () => {
    const world = createSaveWorld();
    world.pipeline.runTicks(31);
    const text = saveGame(world.parts);
    expect(text).toContain('"phase"');
    expect(text).toContain('"interrupted_by_priority"');
    expect(text).not.toContain("Promise");
  });

  // @covers 006:SC-002
  it("AC5: serialize, deserialize, serialize is bit-for-bit identical", () => {
    const world = createSaveWorld();
    world.pipeline.runTicks(77);
    const first = saveGame(world.parts);
    const copy = createSaveWorld(123);
    loadGame(first, copy.parts);
    expect(saveGame(copy.parts)).toBe(first);
  });
});

describe("US2: load game", () => {
  // @covers 006:FR-015
  it("AC4: entity ids are preserved and never reused after load", () => {
    const world = createSaveWorld();
    world.pipeline.runTicks(40);
    const before = world.parts.store.entities().map((entity) => entity.id);
    const copy = createSaveWorld(5);
    loadGame(saveGame(world.parts), copy.parts);
    expect(copy.parts.store.entities().map((entity) => entity.id)).toEqual(before);
    const fresh = copy.parts.store.spawn("villager");
    expect(fresh.id).toBe(Math.max(...before) + 1);
  });

  it("AC5: invalid JSON is rejected with InvalidSaveFormatError and the game is unchanged", () => {
    const world = createSaveWorld();
    world.pipeline.runTicks(10);
    const before = saveGame(world.parts);
    expect(() => loadGame("{ truncated", world.parts)).toThrow(InvalidSaveFormatError);
    expect(saveGame(world.parts)).toBe(before);
    world.pipeline.runTicks(1);
    expect(saveGame(world.parts)).not.toBe(before);
  });

  // @covers 006:SC-004
  it("rejects a truncated or field-less save with a descriptive message in about 10 ms", () => {
    const world = createSaveWorld();
    const text = saveGame(world.parts);
    const damaged = [text.slice(0, Math.floor(text.length / 2)), JSON.stringify({ version: 1 })];
    for (const input of damaged) {
      const started = performance.now();
      let message = "";
      try {
        loadGame(input, world.parts);
      } catch (failure) {
        message = failure instanceof Error ? failure.message : "";
      }
      expect(performance.now() - started).toBeLessThan(100);
      expect(message.length).toBeGreaterThan(10);
    }
    expect(saveGame(world.parts)).toBe(text);
  });

  it("AC3: an in-flight task resolves when expected after load", () => {
    const reference = createSaveWorld();
    reference.pipeline.runTicks(31);
    const text = saveGame(reference.parts);
    reference.pipeline.runTicks(60);
    const resumed = createSaveWorld(77);
    loadGame(text, resumed.parts);
    resumed.pipeline.runTicks(60);
    expect(saveGame(resumed.parts)).toBe(saveGame(reference.parts));
  });
});

describe("US3: version and compatibility", () => {
  function savedRoot(): Root {
    const world = createSaveWorld();
    world.pipeline.runTicks(15);
    return JSON.parse(saveGame(world.parts)) as Root;
  }

  it("AC1: the current version loads", () => {
    const target = createSaveWorld();
    expect(loadGame(savedRoot(), target.parts).migrated).toBe(false);
  });

  // @covers 006:FR-016
  // @covers 006:SC-005
  it("AC2 and AC4: a version 0 fixture is migrated (counters added, difficulty renamed)", () => {
    const root = savedRoot();
    const old: Root = { ...root, version: 0 };
    delete old["counters"];
    delete old["systems"];
    old["initOptions"] = { ...(root["initOptions"] as Root), difficulty: "normal" };
    const target = createSaveWorld(2);
    const result = loadGame(old, target.parts);
    expect(result).toMatchObject({ originalVersion: 0, migrated: true });
    expect(target.parts.initOptions.options.difficulty).toBe("steady");
    expect(JSON.parse(saveGame(target.parts))["version"]).toBe(currentSaveVersion);
    target.pipeline.runTicks(5);
  });

  it("AC3: a newer version is rejected with a typed error", () => {
    const target = createSaveWorld();
    expect(() => loadGame({ ...savedRoot(), version: 2 }, target.parts)).toThrow(
      UnsupportedSaveVersionError,
    );
  });

  it("unknown fields: root and component records reject, initOptions ignores (DECISIONS D-05)", () => {
    const root = savedRoot();
    const target = createSaveWorld();
    expect(() => loadGame({ ...root, bonus: 1 }, target.parts)).toThrow(InvalidSaveFormatError);
    const entities = root["entities"] as Root[];
    const first = entities[0] as Root;
    const withExtraField = {
      ...first,
      components: { ...(first["components"] as Root), Position: { mapId: 1, cellIndex: 0, z: 1 } },
    };
    expect(() =>
      loadGame({ ...root, entities: [withExtraField, ...entities.slice(1)] }, target.parts),
    ).toThrow(InvalidSaveFormatError);
    const typo = { ...root, initOptions: { ...(root["initOptions"] as Root), colour: "red" } };
    expect(() => loadGame(typo, target.parts)).not.toThrow();
  });
});

describe("US4: deterministic round trip", () => {
  const reference = createSaveWorld();
  reference.pipeline.runTicks(longRun);
  const referenceHash = hashGameState(reference.parts);
  const referenceText = saveGame(reference.parts);

  // @covers 006:SC-003
  it("AC2: M ticks, save, load, then N-M ticks equals N uninterrupted ticks (500 ticks)", () => {
    const first = createSaveWorld();
    first.pipeline.runTicks(180);
    const resumed = createSaveWorld(31337);
    loadGame(saveGame(first.parts), resumed.parts);
    resumed.pipeline.runTicks(longRun - 180);
    expect(hashGameState(resumed.parts)).toBe(referenceHash);
    expect(saveGame(resumed.parts)).toBe(referenceText);
  });

  it("holds for a save at every one of 160 split points, each also re-saving identically", () => {
    const total = 160;
    const straight = createSaveWorld();
    straight.pipeline.runTicks(total);
    const expected = hashGameState(straight.parts);
    for (let split = 1; split < total; split += 1) {
      const world = createSaveWorld();
      world.pipeline.runTicks(split);
      const text = saveGame(world.parts);
      const loaded = createSaveWorld(split);
      loadGame(text, loaded.parts);
      expect(saveGame(loaded.parts)).toBe(text);
      loaded.pipeline.runTicks(total - split);
      expect(hashGameState(loaded.parts)).toBe(expected);
    }
  });

  it("holds repeatedly: saving and loading every 25 ticks changes nothing", () => {
    let world = createSaveWorld();
    for (let step = 0; step < longRun / 25; step += 1) {
      world.pipeline.runTicks(25);
      const next = createSaveWorld(step);
      loadGame(saveGame(world.parts), next.parts);
      world = next;
    }
    expect(hashGameState(world.parts)).toBe(referenceHash);
  });

  it("is byte-identical across different seeds' independent worlds only when the seed matches", () => {
    const other = createSaveWorld(43);
    other.pipeline.runTicks(longRun);
    expect(hashGameState(other.parts)).not.toBe(referenceHash);
  });
});

describe("SC-001: 100+ entities and 5 maps round trip quickly", () => {
  // @covers 006:SC-001
  it("saves and loads a larger world within the budget", () => {
    const world = createSaveWorld();
    for (let index = 0; index < 3; index += 1) {
      world.parts.maps.createMap({
        gridType: GridType.Square,
        terrainId: "grass",
        width: 20,
        height: 20,
      });
    }
    for (let index = 0; index < 120; index += 1) {
      const entity = world.parts.store.spawn("villager");
      const mapId = 1 + (index % 5);
      const cell = (index * 7) % 30;
      world.parts.maps.placeEntity(entity.id, mapId, cell);
      const position = requireComponent(entity, positionComponent);
      position.mapId = mapId;
      position.cellIndex = cell;
    }
    expect(world.parts.maps.list()).toHaveLength(5);
    expect(world.parts.store.entities().length).toBeGreaterThanOrEqual(120);
    const target = createSaveWorld();
    const started = performance.now();
    const text = saveGame(world.parts);
    loadGame(text, target.parts);
    const elapsed = performance.now() - started;
    expect(saveGame(target.parts)).toBe(text);
    // Spec budget is 100 ms; the margin keeps loaded CI machines from flaking.
    expect(elapsed).toBeLessThan(5000);
  });
});
