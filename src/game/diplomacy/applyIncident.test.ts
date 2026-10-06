import { describe, expect, it } from "vitest";
import { Difficulty } from "../save/initOptions";
import { getStanding } from "../factions/factionStanding";
import { applyIncident } from "./applyIncident";
import { createDiplomacyWorld } from "./testDiplomacyWorld";

describe("applyIncident", () => {
  it("lowers the settlement's view by 5 and the faction's by 2 and queues diplomacy.incident", () => {
    const world = createDiplomacyWorld();
    const baron = world.npc("ashford_barony");
    const incidents = world.record("diplomacy.incident");
    expect(applyIncident(world.engine, baron, world.government)).toBe(-5);
    world.engine.bus.processQueue();
    expect(getStanding(world.engine, world.government, baron).value).toBe(-10);
    expect(getStanding(world.engine, baron, world.government).value).toBe(-7);
    expect(incidents).toEqual([
      { factionId: baron, targetFactionId: world.government, kind: "insult", delta: -5 },
    ]);
  });

  it.each([
    [Difficulty.Peaceful, -1, -5 - 1, -5],
    [Difficulty.Steady, -5, -5 - 5, -5 - 2],
    [Difficulty.Harsh, -7, -5 - 7, -5 - 3],
  ])(
    "on %s the hostile deltas are scaled by the hostility multiplier",
    (difficulty, delta, ours, theirs) => {
      const world = createDiplomacyWorld({ difficulty });
      const baron = world.npc("ashford_barony");
      expect(applyIncident(world.engine, baron, world.government)).toBe(delta);
      expect(getStanding(world.engine, world.government, baron).value).toBe(ours);
      expect(getStanding(world.engine, baron, world.government).value).toBe(theirs);
    },
  );
});
