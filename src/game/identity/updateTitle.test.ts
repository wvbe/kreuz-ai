import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { joinFaction } from "../factions/factionMembership";
import { assignIdentity } from "./assignIdentity";
import { TitleRank } from "./identityTypes";
import type { IdentityData, IdentityTitleChanged } from "./identityTypes";
import { updateTitle } from "./updateTitle";

function setup() {
  const engine = new GameEngine(loadContent(), { entropy: () => 1 });
  engine.newGame({ seed: 7 });
  const entity = engine.store.spawn("peasant");
  joinFaction(engine, entity.id, 1);
  assignIdentity(engine, entity.id);
  const skills = entity.components["Skills"] as { values: { [skillId: string]: number } };
  const identity = entity.components["Identity"] as IdentityData;
  const events: IdentityTitleChanged[] = [];
  engine.bus.subscribe<IdentityTitleChanged>("identity.title.changed", (payload) =>
    events.push(payload),
  );
  return { engine, id: entity.id, skills, identity, events };
}

describe("updateTitle", () => {
  it("does nothing while the title is unchanged", () => {
    const { engine, id, events } = setup();
    expect(updateTitle(engine, id)).toBe(false);
    engine.bus.processQueue();
    expect(events).toEqual([]);
  });

  // @covers 028:FR-010
  it("replaces the snapshot and emits old and new title once", () => {
    const { engine, id, skills, identity, events } = setup();
    skills.values["baking"] = 20_000;
    expect(updateTitle(engine, id)).toBe(true);
    expect(updateTitle(engine, id)).toBe(false);
    skills.values["baking"] = 60_000;
    expect(updateTitle(engine, id)).toBe(true);
    engine.bus.processQueue();
    expect(identity.titleSnapshot?.rank).toBe(TitleRank.Master);
    expect(events.map((event) => [event.oldTitle?.rank ?? null, event.newTitle?.rank])).toEqual([
      [null, TitleRank.Practitioner],
      [TitleRank.Practitioner, TitleRank.Master],
    ]);
  });

  it("ignores unknown entities and entities without identity", () => {
    const { engine } = setup();
    expect(updateTitle(engine, 999)).toBe(false);
    expect(updateTitle(engine, 1)).toBe(false);
  });
});
