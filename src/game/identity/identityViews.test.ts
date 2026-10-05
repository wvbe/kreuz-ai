import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { joinFaction } from "../factions/factionMembership";
import { setFactionLeader } from "../factions/factionLeader";
import { assignIdentity } from "./assignIdentity";
import { buildIdentityView } from "./identityViews";

describe("buildIdentityView", () => {
  it("shows names, title, offices and the styled name", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    engine.newGame({ seed: 7 });
    const baker = engine.store.spawn("baker");
    joinFaction(engine, baker.id, 1);
    assignIdentity(engine, baker.id);
    setFactionLeader(engine, 1, baker.id);
    const view = buildIdentityView(engine, baker);
    const identity = baker.components["Identity"] as { givenName: string; byname: string | null };
    expect(view).toEqual({
      entityId: baker.id,
      givenName: identity.givenName,
      byname: identity.byname,
      nameOrdinal: 0,
      fullName: `${identity.givenName}${identity.byname === null ? "" : ` ${identity.byname}`}`,
      title: { skillId: "baking", rank: "practitioner", noun: "Baker", guildId: null },
      offices: [{ factionId: 1, factionName: "Settlement", leaderTitle: "Reeve" }],
      styledName: `${identity.givenName} the Baker, Reeve of the Settlement`,
    });
  });

  it("is null for entities without identity", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    engine.newGame({ seed: 7 });
    expect(buildIdentityView(engine, engine.store.require(1))).toBeNull();
  });
});
