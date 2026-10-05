import { describe, expect, it } from "vitest";
import type { JsonObject } from "./migrationTypes";
import { migrateV0ToV1 } from "./migrateV0ToV1";

function v0Root(difficulty: string): JsonObject {
  return {
    version: 0,
    timestamp: "2026-01-01T00:00:00.000Z",
    initOptions: { seed: 5, difficulty, startingTier: null, mapSize: null },
    entities: [
      {
        id: 3,
        prototype: "villager",
        components: {
          TaskQueue: { tasks: [{ id: 7 }], history: [{ id: 9 }] },
        },
      },
      { id: 8, prototype: "rock", components: {} },
    ],
    maps: [{ id: 2 }, { id: 4 }],
  };
}

describe("migrateV0ToV1", () => {
  it("renames the old difficulty names", () => {
    expect(migrateV0ToV1(v0Root("normal"))["initOptions"]).toMatchObject({ difficulty: "steady" });
    expect(migrateV0ToV1(v0Root("hard"))["initOptions"]).toMatchObject({ difficulty: "harsh" });
  });

  it("leaves current difficulty names alone", () => {
    expect(migrateV0ToV1(v0Root("peaceful"))["initOptions"]).toMatchObject({
      difficulty: "peaceful",
    });
  });

  it("derives counters from the highest ids so none is reused", () => {
    const counters = migrateV0ToV1(v0Root("normal"))["counters"];
    expect(counters).toMatchObject({ nextEntityId: 9, nextMapId: 5, nextTaskId: 10 });
    expect(counters).toMatchObject({ nextJobId: 1, nextZoneEventId: 1 });
  });

  it("starts counters at 1 for an empty world and adds empty systems", () => {
    const migrated = migrateV0ToV1({ version: 0 });
    expect(migrated["counters"]).toMatchObject({ nextEntityId: 1, nextMapId: 1, nextTaskId: 1 });
    expect(migrated["systems"]).toEqual({});
  });

  it("keeps counters and systems that already exist and tolerates malformed input", () => {
    const migrated = migrateV0ToV1({
      version: 0,
      counters: { nextEntityId: 50 },
      systems: { demo: 1 },
      initOptions: 5,
      entities: [1, { id: "x" }, { id: 1, components: { TaskQueue: 3 } }],
    });
    expect(migrated["counters"]).toEqual({ nextEntityId: 50 });
    expect(migrated["systems"]).toEqual({ demo: 1 });
    expect(migrated["initOptions"]).toBe(5);
  });
});
