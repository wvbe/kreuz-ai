import { describe, expect, it } from "vitest";
import { NeedPlanKind } from "../ai/decision/needPlanTypes";
import { needsComponent } from "../ai/needs/needsComponent";
import { removeItems } from "../ai/testAiWorld";
import { getComponent } from "../ecs/Entity";
import { getTotal } from "../inventory/inventoryQueries";
import { storageNeedSource } from "./storageNeedSource";
import { getStorageService } from "./storageServiceRegistry";
import { ReservationKind } from "./storageTypes";
import { createStorageWorld } from "./testStorageWorld";
import type { StorageTestWorld } from "./testStorageWorld";

function hungryWorld() {
  const world = createStorageWorld();
  const settler = world.spawn("peasant", 20);
  removeItems(world, settler.id, "bread");
  const need = world.engine.content.needs.require("hunger");
  const method = need.satisfactionMethods.find((entry) => entry.ref === "bread");
  if (method === undefined) {
    throw new Error("the hunger need has no bread method");
  }
  return { world, settler, need, method };
}

function hunger(world: StorageTestWorld, entityId: number): number {
  const needs = getComponent(world.engine.store.require(entityId), needsComponent);
  return needs?.values.find((entry) => entry.needId === "hunger")?.valueMilli ?? -1;
}

describe("storageNeedSource", () => {
  it("plans to consume bread from the nearest stockpile that has some", () => {
    const { world, settler, need, method } = hungryWorld();
    const far = world.chest(90);
    const near = world.chest(25);
    world.give(far, "bread", 3);
    world.give(near, "bread", 3);
    const plan = storageNeedSource(world.engine, settler, need, method);
    expect(plan).toEqual({
      kind: NeedPlanKind.Consume,
      needId: "hunger",
      sourceId: near.id,
      materialId: "bread",
      mapId: world.mapId,
      cellIndex: 25,
      amountMilli: method.amount,
    });
  });

  it("returns null without bread in storage or without a position", () => {
    const { world, settler, need, method } = hungryWorld();
    world.chest(25);
    expect(storageNeedSource(world.engine, settler, need, method)).toBeNull();
    world.engine.store.removeComponent(settler.id, { name: "Position" });
    expect(storageNeedSource(world.engine, settler, need, method)).toBeNull();
  });

  it("ignores bread that others reserved", () => {
    const { world, settler, need, method } = hungryWorld();
    const chest = world.chest(25);
    world.give(chest, "bread", 2);
    const other = world.spawn("peasant", 30);
    getStorageService(world.engine).reservations.reserve({
      kind: ReservationKind.Payment,
      holderId: other.id,
      inventoryOwnerId: chest.id,
      materialId: "bread",
      quantity: 2,
    });
    expect(storageNeedSource(world.engine, settler, need, method)).toBeNull();
  });
});

describe("hungry settlers and storage", () => {
  function starve(world: StorageTestWorld, entityId: number): void {
    const needs = getComponent(world.engine.store.require(entityId), needsComponent);
    for (const entry of needs?.values ?? []) {
      if (entry.needId === "hunger") {
        entry.valueMilli = 4000;
      }
    }
  }

  it("walks to the chest and eats bread from it", () => {
    const { world, settler } = hungryWorld();
    const chest = world.chest(25);
    world.give(chest, "bread", 3);
    starve(world, settler.id);
    world.run(60);
    expect(getTotal(chest, "bread")).toBe(2);
    expect(hunger(world, settler.id)).toBeGreaterThan(4000);
  });

  it("cannot eat reserved bread: the consumption fails and nothing is taken", () => {
    const { world, settler } = hungryWorld();
    const chest = world.chest(25);
    world.give(chest, "bread", 1);
    const other = world.spawn("peasant", 30);
    starve(world, settler.id);
    world.run(1);
    getStorageService(world.engine).reservations.reserve({
      kind: ReservationKind.Payment,
      holderId: other.id,
      inventoryOwnerId: chest.id,
      materialId: "bread",
      quantity: 1,
    });
    world.run(60);
    expect(getTotal(chest, "bread")).toBe(1);
  });
});
