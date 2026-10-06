import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../engine/EventBus";
import { Difficulty } from "../../save/initOptions";
import { getAiService } from "../aiServiceRegistry";
import { createAiWorld } from "../testAiWorld";
import { getNeedValue } from "./needAccess";
import { applyHealthConsequences, runNeedsTick } from "./runNeeds";

function setNeed(
  world: ReturnType<typeof createAiWorld>,
  id: number,
  needId: string,
  value: number,
): void {
  const needs = world.engine.store.require(id).components["Needs"] as {
    values: { needId: string; valueMilli: number }[];
  };
  const slot = needs.values.find((entry) => entry.needId === needId);
  if (slot) slot.valueMilli = value;
}

function setHealth(world: ReturnType<typeof createAiWorld>, id: number, value: number): void {
  (world.engine.store.require(id).components["Health"] as { valueMilli: number }).valueMilli =
    value;
}

function healthOf(world: ReturnType<typeof createAiWorld>, id: number): number {
  return (world.engine.store.require(id).components["Health"] as { valueMilli: number }).valueMilli;
}

// @covers 013:FR-001 013:FR-002 013:FR-018
describe("runNeedsTick", () => {
  it("decays every need linearly by its authored rate", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 0);
    runNeedsTick(world.engine, 1);
    runNeedsTick(world.engine, 2);
    const entity = world.engine.store.require(farmer.id);
    expect(getNeedValue(entity, "hunger")).toBe(80_000 - 300);
    expect(getNeedValue(entity, "rest")).toBe(80_000 - 300);
    expect(getNeedValue(entity, "safety")).toBe(80_000 - 40);
  });

  it("scales decay with the difficulty of the game", () => {
    const harsh = createAiWorld({ difficulty: Difficulty.Harsh });
    const farmer = harsh.spawn("farmer", 0);
    runNeedsTick(harsh.engine, 1);
    expect(getNeedValue(harsh.engine.store.require(farmer.id), "hunger")).toBe(80_000 - 195);
    const peaceful = createAiWorld({ difficulty: Difficulty.Peaceful });
    const other = peaceful.spawn("farmer", 0);
    runNeedsTick(peaceful.engine, 1);
    expect(getNeedValue(peaceful.engine.store.require(other.id), "hunger")).toBe(80_000 - 105);
  });

  it("uses the replaceable multiplier hook and returns to the default with null", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 0);
    const service = getAiService(world.engine);
    service.setNeedDecayMultiplier(() => 2000);
    runNeedsTick(world.engine, 1);
    expect(getNeedValue(world.engine.store.require(farmer.id), "hunger")).toBe(80_000 - 300);
    service.setNeedDecayMultiplier(null);
    runNeedsTick(world.engine, 2);
    expect(getNeedValue(world.engine.store.require(farmer.id), "hunger")).toBe(80_000 - 450);
  });

  it("applies trait modifiers (hearty decays hunger slower)", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 0);
    world.engine.store.require(farmer.id).components["Traits"] = { ids: ["hearty"] };
    runNeedsTick(world.engine, 1);
    expect(getNeedValue(world.engine.store.require(farmer.id), "hunger")).toBe(80_000 - 120);
  });

  it("never lets a need go below zero", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 0);
    setNeed(world, farmer.id, "hunger", 100);
    runNeedsTick(world.engine, 1);
    expect(getNeedValue(world.engine.store.require(farmer.id), "hunger")).toBe(0);
  });

  it("ignores entities without Needs", () => {
    const world = createAiWorld();
    const board = world.engine.store.spawn("job_board");
    expect(() => runNeedsTick(world.engine, 1)).not.toThrow();
    expect(world.engine.store.require(board.id).components["Needs"]).toBeUndefined();
  });
});

describe("applyHealthConsequences", () => {
  it("lowers health while hunger is zero", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 0);
    setNeed(world, farmer.id, "hunger", 0);
    applyHealthConsequences(world.engine, world.engine.store.require(farmer.id));
    expect(healthOf(world, farmer.id)).toBe(100_000 - 250);
  });

  it("kills at zero health: entity.died with cause Starvation and deletion at slot 17", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 0);
    const died: JsonValue[] = [];
    world.engine.bus.subscribe("entity.died", (payload) => died.push(payload));
    setNeed(world, farmer.id, "hunger", 0);
    setHealth(world, farmer.id, 250);
    applyHealthConsequences(world.engine, world.engine.store.require(farmer.id));
    expect(world.engine.store.isPendingDelete(farmer.id)).toBe(true);
    world.engine.bus.processQueue();
    expect(died).toEqual([{ entityId: farmer.id, cause: "Starvation" }]);
    world.engine.tick();
    expect(world.engine.store.get(farmer.id)).toBeUndefined();
  });

  it("regenerates health while no need is zero, up to the maximum", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 0);
    setHealth(world, farmer.id, 50_000);
    applyHealthConsequences(world.engine, world.engine.store.require(farmer.id));
    expect(healthOf(world, farmer.id)).toBe(50_020);
    setHealth(world, farmer.id, 99_990);
    applyHealthConsequences(world.engine, world.engine.store.require(farmer.id));
    expect(healthOf(world, farmer.id)).toBe(100_000);
  });

  it("does not regenerate while another need is zero", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 0);
    setNeed(world, farmer.id, "rest", 0);
    setHealth(world, farmer.id, 50_000);
    applyHealthConsequences(world.engine, world.engine.store.require(farmer.id));
    expect(healthOf(world, farmer.id)).toBe(50_000);
  });

  it("does nothing for entities without Health", () => {
    const world = createAiWorld();
    const board = world.engine.store.spawn("job_board");
    expect(() =>
      applyHealthConsequences(world.engine, world.engine.store.require(board.id)),
    ).not.toThrow();
  });
});
