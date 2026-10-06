import { describe, expect, it } from "vitest";
import { ticksPerDay } from "../time/GameTime";
import { DwellingLevel } from "../content/contentTypes";
import { governmentFactionId } from "../factions/factionRegistry";
import { getHousingService } from "./housingServiceRegistry";
import { createHousingWorld, contentWithLevels } from "./testHousingWorld";
import type { HousingTestWorld } from "./testHousingWorld";

const options = { width: 16, height: 12 };

// Cells in the free bottom rows of the 16x12 test map.
const free = (index: number): number => 10 * 16 + index;

const cottageLike = {
  cottage: {
    capacity: 3,
    rentPerDay: 2,
    minTiles: 4,
    furniture: [{ kind: "tag", ref: "bed", count: 2 }],
    foodVariety: 0,
    suppliedGoods: [],
    services: [],
    unlockTier: null,
  },
};

function giveCoins(world: HousingTestWorld, entityId: number, coins: number): void {
  world.give(world.engine.store.require(entityId), world.engine.materials.currencyId, coins);
}

describe("runHousingEvaluation", () => {
  it("runs once per day at the housing tick of day (FR-006)", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    world.runEvaluations(1);
    expect(world.engine.time.tickCount % ticksPerDay).toBe(72);
    expect(world.dwellingData(zone).lastEvaluatedDay).toBe(0);
    world.runEvaluations(1);
    expect(world.dwellingData(zone).lastEvaluatedDay).toBe(1);
  });

  it("houses the homeless in ascending entity id order, one event each (US1.2)", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    const assigned = world.record("housing.resident.assigned");
    const [late, early, extra] = [
      world.settler(free(3)),
      world.settler(free(1)),
      world.settler(free(2)),
    ];
    world.runEvaluations(1);
    expect(world.residents(zone)).toEqual([late.id, early.id]);
    expect(assigned).toEqual([
      { dwellingId: zone, entityId: late.id },
      { dwellingId: zone, entityId: early.id },
    ]);
    expect(world.residents(zone)).not.toContain(extra.id);
  });

  it("offers no slots, takes no rent and makes no progress while inactive (US1.5)", () => {
    const world = createHousingWorld({
      ...options,
      content: contentWithLevels({ hovel: { rentPerDay: 3 } }),
    });
    const zone = world.dwelling(2, 2, { beds: 2 });
    const settler = world.settler(free(1));
    giveCoins(world, settler.id, 10);
    world.runEvaluations(2);
    expect(world.residents(zone)).toEqual([settler.id]);
    expect(world.coins(settler.id)).toBe(7);
    const door = world.engine.store.entities().find((entity) => entity.prototype === "door");
    world.engine.store.requestDelete(door?.id ?? 0);
    world.run(2);
    const newcomer = world.settler(free(2));
    world.runEvaluations(1);
    expect(world.dwellingData(zone).upgradeStreak).toBe(0);
    expect(world.coins(settler.id)).toBe(7);
    expect(world.residents(zone)).toEqual([settler.id]);
    expect(world.residents(zone)).not.toContain(newcomer.id);
  });

  it("upgrades after upgradeGraceDays qualifying evaluations and says so (US2.1, SC-001)", () => {
    const world = createHousingWorld({ ...options, content: contentWithLevels(cottageLike) });
    const zone = world.dwelling(2, 2, { beds: 2 });
    const upgrades = world.record("housing.dwelling.upgraded");
    world.settler(free(1));
    // Day 0 houses the settler; the streak runs on days 1, 2 and 3.
    world.runEvaluations(1);
    expect(world.dwellingData(zone).upgradeStreak).toBe(0);
    world.runEvaluations(1);
    expect(world.dwellingData(zone).upgradeStreak).toBe(1);
    world.runEvaluations(1);
    expect(world.dwellingData(zone).upgradeStreak).toBe(2);
    expect(upgrades).toEqual([]);
    world.runEvaluations(1);
    expect(world.dwellingData(zone).level).toBe("cottage");
    expect(world.dwellingData(zone).upgradeStreak).toBe(0);
    expect(upgrades).toEqual([{ dwellingId: zone, fromLevel: "hovel", toLevel: "cottage" }]);
  });

  it("resets the streak when a requirement is lost before the grace is over (US2.2)", () => {
    const world = createHousingWorld({ ...options, content: contentWithLevels(cottageLike) });
    const zone = world.dwelling(2, 2, { beds: 2 });
    world.settler(free(1));
    world.runEvaluations(3);
    expect(world.dwellingData(zone).upgradeStreak).toBe(2);
    const bed = world.engine.store
      .entities()
      .filter((entity) => entity.prototype === "furniture_piece")[1];
    world.engine.store.requestDelete(bed?.id ?? 0);
    world.runEvaluations(1);
    expect(world.dwellingData(zone).upgradeStreak).toBe(0);
    expect(world.dwellingData(zone).level).toBe("hovel");
  });

  it("builds no streak while the next level is tier-locked (US2.6)", () => {
    const world = createHousingWorld({
      ...options,
      content: contentWithLevels({
        ...cottageLike,
        cottage: { ...cottageLike.cottage, unlockTier: "village" },
      }),
    });
    const zone = world.dwelling(2, 2, { beds: 2 });
    world.settler(free(1));
    world.runEvaluations(5);
    expect(world.dwellingData(zone).upgradeStreak).toBe(0);
    expect(world.dwellingData(zone).level).toBe("hovel");
    const view = world.query("dwelling", { id: zone }) as {
      next: { requirements: { kind: string; met: boolean; requiredTier: string | null }[] };
    };
    const lock = view.next.requirements.find((entry) => entry.kind === "TierUnlocked");
    expect(lock).toMatchObject({ met: false, requiredTier: "village" });
  });

  it("warns on the first failing day, downgrades on day 7 and evicts the latest residents (US4)", () => {
    const world = createHousingWorld({
      ...options,
      content: contentWithLevels({
        cottage: { ...cottageLike.cottage, furniture: [{ kind: "tag", ref: "bed", count: 3 }] },
      }),
    });
    const zone = world.dwelling(2, 2, { columns: 3, rows: 2, beds: 3 });
    const settlers = [world.settler(free(1)), world.settler(free(2)), world.settler(free(3))];
    const atRisk = world.record("housing.dwelling.at-risk");
    const downgraded = world.record("housing.dwelling.downgraded");
    const evicted = world.record("housing.resident.evicted");
    // A Cottage at capacity 3 with three residents assigned on distinct ticks.
    world.setLevel(zone, DwellingLevel.Cottage);
    settlers.forEach((settler, index) => {
      const citizen = settler.components["Citizen"] as {
        homeDwellingId: number | null;
        homeAssignedTick: number;
      };
      citizen.homeDwellingId = zone;
      citizen.homeAssignedTick = 10 + index;
    });
    const bed = world.engine.store
      .entities()
      .filter((entity) => entity.prototype === "furniture_piece")[0];
    world.engine.store.requestDelete(bed?.id ?? 0);
    world.runEvaluations(1);
    expect(atRisk).toEqual([
      { dwellingId: zone, level: "cottage", unmetRequirements: ["Furniture:3x tag:bed"] },
    ]);
    world.runEvaluations(5);
    expect(world.dwellingData(zone)).toMatchObject({ level: "cottage", downgradeStreak: 6 });
    expect(downgraded).toEqual([]);
    world.runEvaluations(1);
    expect(world.dwellingData(zone)).toMatchObject({ level: "hovel", downgradeStreak: 0 });
    expect(downgraded).toEqual([{ dwellingId: zone, fromLevel: "cottage", toLevel: "hovel" }]);
    expect(evicted).toEqual([
      { dwellingId: zone, entityId: settlers[2]?.id, reason: "CapacityReduced" },
    ]);
    expect(world.residents(zone)).toEqual([settlers[0]?.id, settlers[1]?.id]);
  });

  it("recovers without a downgrade when the failing streak ends early (US4.2)", () => {
    const world = createHousingWorld({
      ...options,
      content: contentWithLevels({
        cottage: { ...cottageLike.cottage, furniture: [{ kind: "tag", ref: "bed", count: 2 }] },
      }),
    });
    const zone = world.dwelling(2, 2, { beds: 2 });
    world.settler(free(1));
    world.setLevel(zone, DwellingLevel.Cottage);
    const bed = world.engine.store
      .entities()
      .filter((entity) => entity.prototype === "furniture_piece")[1];
    world.engine.store.requestDelete(bed?.id ?? 0);
    world.runEvaluations(4);
    expect(world.dwellingData(zone).downgradeStreak).toBe(3);
    world.furniture(world.tiles(zone)[3] as number, "wooden_bed");
    world.runEvaluations(1);
    expect(world.dwellingData(zone)).toMatchObject({ level: "cottage", downgradeStreak: 0 });
  });

  it("never drops a Hovel below Hovel (US4.4)", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 1 });
    world.settler(free(1));
    world.runEvaluations(10);
    expect(world.dwellingData(zone)).toMatchObject({ level: "hovel", downgradeStreak: 0 });
  });

  it("collects rent from residents in id order into the treasury (US5.1)", () => {
    const world = createHousingWorld({ ...options, content: contentWithLevels(cottageLike) });
    const zone = world.dwelling(2, 2, { beds: 2 });
    world.setLevel(zone, DwellingLevel.Cottage);
    const [first, second] = [world.settler(free(1)), world.settler(free(2))];
    giveCoins(world, first.id, 1);
    giveCoins(world, second.id, 5);
    const collected = world.record("housing.rent.collected");
    const before = world.treasury();
    world.runEvaluations(1);
    expect(world.residents(zone)).toEqual([first.id, second.id]);
    // Residents are housed in step 6, after rent: nobody paid on the first day.
    expect(collected).toEqual([]);
    world.runEvaluations(1);
    expect(world.coins(first.id)).toBe(0);
    expect(world.coins(second.id)).toBe(4);
    expect(world.treasury()).toBe(before + 2);
    expect(collected).toEqual([{ dwellingId: zone, amount: 2 }]);
  });

  it("settles the first rent day after the household is formed and reports the shortfall (US5.2)", () => {
    const world = createHousingWorld({ ...options, content: contentWithLevels(cottageLike) });
    const zone = world.dwelling(2, 2, { beds: 2 });
    world.setLevel(zone, DwellingLevel.Cottage);
    const settler = world.settler(free(1));
    giveCoins(world, settler.id, 1);
    const unpaid = world.record("housing.rent.unpaid");
    world.runEvaluations(2);
    expect(world.coins(settler.id)).toBe(0);
    expect(unpaid).toEqual([{ dwellingId: zone, shortfall: 1, reason: "InsufficientFunds" }]);
  });

  it("keeps the coins and says TreasuryUnavailable when the treasury cannot take them (US5.3)", () => {
    const world = createHousingWorld({ ...options, content: contentWithLevels(cottageLike) });
    const zone = world.dwelling(2, 2, { beds: 2 });
    world.setLevel(zone, DwellingLevel.Cottage);
    const settler = world.settler(free(1));
    giveCoins(world, settler.id, 4);
    const unpaid = world.record("housing.rent.unpaid");
    world.engine.store.removeComponent(governmentFactionId(world.engine) ?? 0, {
      name: "Inventory",
    });
    world.runEvaluations(2);
    expect(world.coins(settler.id)).toBe(4);
    expect(unpaid).toEqual([{ dwellingId: zone, shortfall: 2, reason: "TreasuryUnavailable" }]);
  });

  it("conserves coins over many days of rent (SC-004)", () => {
    const world = createHousingWorld({ ...options, content: contentWithLevels(cottageLike) });
    const zone = world.dwelling(2, 2, { beds: 2 });
    world.setLevel(zone, DwellingLevel.Cottage);
    const settlers = [world.settler(free(1)), world.settler(free(2))];
    settlers.forEach((settler) => giveCoins(world, settler.id, 20));
    const total = (): number =>
      world.treasury() + settlers.reduce((sum, settler) => sum + world.coins(settler.id), 0);
    const before = total();
    world.runEvaluations(10);
    expect(total()).toBe(before);
    expect(world.treasury()).toBeGreaterThan(1000);
  });

  it("brings min(free slots, 2) settlers after housing the homeless (US5.4, US5.6)", () => {
    const world = createHousingWorld(options);
    world.throneRoom(10, 2);
    const low = world.dwelling(2, 2, { beds: 2 });
    const high = world.dwelling(2, 6, { beds: 2 });
    world.setLevel(high, DwellingLevel.Cottage);
    const arrived = world.record("housing.immigrant.arrived");
    const homeless = world.settler(free(1));
    world.runEvaluations(1);
    // One homeless citizen takes a slot of the highest level; 3 slots are free, 2 settlers come.
    expect(world.residents(high)).toContain(homeless.id);
    expect(arrived).toHaveLength(2);
    expect(world.residents(high)).toHaveLength(2);
    expect(world.residents(low)).toHaveLength(1);
    const first = arrived[0] as { entityId: number; prototypeId: string; dwellingId: number };
    expect(first.prototypeId).toBe("peasant");
    expect(world.engine.store.require(first.entityId).components["Citizen"]).toMatchObject({
      homeDwellingId: first.dwellingId,
    });
  });

  it("brings nobody without a seat of government and says why (FR-015)", () => {
    const world = createHousingWorld(options);
    world.dwelling(2, 2, { beds: 2 });
    const blocked = world.record("housing.immigration.blocked");
    const arrived = world.record("housing.immigrant.arrived");
    world.runEvaluations(2);
    expect(arrived).toEqual([]);
    expect(blocked).toEqual([{ reason: "NoSeatOfGovernment" }, { reason: "NoSeatOfGovernment" }]);
  });

  it("admits at most maxImmigrantsPerDay per day until capacity is full", () => {
    const world = createHousingWorld(options);
    world.throneRoom(10, 2);
    const zone = world.dwelling(2, 2, { columns: 3, rows: 3, beds: 6 });
    world.setLevel(zone, DwellingLevel.BurgherHouse);
    world.runEvaluations(1);
    expect(world.residents(zone)).toHaveLength(2);
    world.runEvaluations(1);
    expect(world.residents(zone)).toHaveLength(4);
    world.runEvaluations(2);
    expect(world.residents(zone)).toHaveLength(6);
    world.runEvaluations(1);
    expect(world.residents(zone)).toHaveLength(6);
  });

  it("is deterministic: two worlds with one seed bring the same settlers (US5.5, SC-003)", () => {
    const run = (): string => {
      const world = createHousingWorld({ ...options, seed: 99 });
      world.throneRoom(10, 2);
      const zone = world.dwelling(2, 2, { columns: 3, rows: 3, beds: 6 });
      world.setLevel(zone, DwellingLevel.BurgherHouse);
      world.runEvaluations(3);
      return JSON.stringify(world.engine.store.serialize());
    };
    expect(run()).toBe(run());
  });

  it("explains an evaluation it has remembered (status cache)", () => {
    const world = createHousingWorld({ ...options, content: contentWithLevels(cottageLike) });
    const zone = world.dwelling(2, 2, { beds: 2 });
    world.settler(free(1));
    world.runEvaluations(2);
    expect(getHousingService(world.engine).recall(zone)?.value.next?.met).toBe(true);
  });
});
