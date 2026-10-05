import { describe, expect, it } from "vitest";
import { bundledContentFiles, loadContent, loadContentPack } from "../content/ContentLoader";
import { ContentFile } from "../content/contentTypes";
import type { JsonValue } from "../engine/EventBus";
import { GameEngine } from "../engine/GameEngine";
import { joinFaction } from "../factions/factionMembership";
import { assignIdentity, takenNames } from "./assignIdentity";
import { identityNamedEvent, identityStreamName } from "./identityTypes";
import type { IdentityData } from "./identityTypes";

function start(content = loadContent()): GameEngine {
  const engine = new GameEngine(content, { entropy: () => 1 });
  engine.newGame({ seed: 7 });
  return engine;
}

function spawnNamed(engine: GameEngine, prototype: string): IdentityData {
  const entity = engine.store.spawn(prototype);
  joinFaction(engine, entity.id, 1);
  assignIdentity(engine, entity.id);
  return entity.components["Identity"] as IdentityData;
}

function collidingContent() {
  const lists = [
    { id: "common_13c", givenNames: [{ name: "Ansel", weight: 1 }], bynames: ["Brook"] },
  ];
  const constants = {
    ...(bundledContentFiles[ContentFile.ContentConstants] as { [key: string]: number }),
    bynameChance: 1,
  };
  return loadContentPack({
    ...bundledContentFiles,
    [ContentFile.NameLists]: lists,
    [ContentFile.ContentConstants]: constants,
  });
}

describe("assignIdentity", () => {
  it("draws a name from the list on identity.names and queues identity.named", () => {
    const engine = start();
    const events: JsonValue[] = [];
    engine.bus.subscribe(identityNamedEvent, (payload) => events.push(payload));
    const identity = spawnNamed(engine, "baker");
    engine.bus.processQueue();
    const list = engine.content.nameLists.require("common_13c");
    expect(list.givenNames.map((entry) => entry.name)).toContain(identity.givenName);
    expect(identity.nameListId).toBe("common_13c");
    expect(events).toEqual([
      {
        entityId: 2,
        givenName: identity.givenName,
        byname: identity.byname,
        nameOrdinal: 0,
      },
    ]);
    expect(Object.keys(engine.prng.serialize().streams)).toContain(identityStreamName);
  });

  it("sets the title snapshot silently from the skills", () => {
    const engine = start();
    const events: string[] = [];
    engine.bus.subscribe("identity.title.changed", () => events.push("changed"));
    const identity = spawnNamed(engine, "baker");
    engine.bus.processQueue();
    expect(identity.titleSnapshot?.skillId).toBe("baking");
    expect(events).toEqual([]);
    expect(spawnNamed(engine, "peasant").titleSnapshot).toBeNull();
  });

  it("keeps the living government citizens unique, falling back to ordinals", () => {
    const engine = start(collidingContent());
    const names = [1, 2, 3].map(() => spawnNamed(engine, "peasant"));
    expect(names.map((name) => [name.givenName, name.byname, name.nameOrdinal])).toEqual([
      ["Ansel", "Brook", 0],
      ["Ansel", "Brook", 2],
      ["Ansel", "Brook", 3],
    ]);
  });

  it("draws nothing for prototypes with a fixed name and applies only the ordinal rule", () => {
    const humanoids = (bundledContentFiles[ContentFile.HumanoidPrototypes] as { id: string }[]).map(
      (entry) =>
        entry.id === "peasant" ? { ...entry, givenName: "Odo", byname: "of the Mill" } : entry,
    );
    const engine = start(
      loadContentPack({ ...bundledContentFiles, [ContentFile.HumanoidPrototypes]: humanoids }),
    );
    const before = JSON.stringify(engine.prng.serialize());
    const first = spawnNamed(engine, "peasant");
    const second = spawnNamed(engine, "peasant");
    expect([first.givenName, first.byname, first.nameOrdinal]).toEqual(["Odo", "of the Mill", 0]);
    expect(second.nameOrdinal).toBe(2);
    expect(JSON.stringify(engine.prng.serialize())).toBe(before);
  });

  it("ignores entities that are not humanoid citizens", () => {
    const engine = start();
    expect(() => assignIdentity(engine, 1)).not.toThrow();
    expect(engine.store.require(1).components["Identity"]).toBeUndefined();
  });
});

describe("takenNames", () => {
  it("lists the named government citizens except the given one", () => {
    const engine = start();
    const first = spawnNamed(engine, "peasant");
    spawnNamed(engine, "peasant");
    const loner = engine.store.spawn("peasant");
    assignIdentity(engine, loner.id);
    expect(takenNames(engine, 2)).toHaveLength(1);
    expect(takenNames(engine, 3)[0]).toEqual({
      givenName: first.givenName,
      byname: first.byname,
      nameOrdinal: first.nameOrdinal,
    });
    expect(takenNames(engine, 99)).toHaveLength(2);
  });
});
