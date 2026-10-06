import { describe, expect, it } from "vitest";
import { bundledContentFiles, loadContentPack } from "../content/ContentLoader";
import { ContentFile } from "../content/contentTypes";
import { getJobService } from "../jobs/jobServiceRegistry";
import { BlockedReasonKind, StatusSubjectKind } from "../status/statusTypes";
import { standingReasons, standingState } from "./standingReasons";
import { runStewardReview } from "./runStewardReview";
import { StandingOrderState } from "./standingTypes";
import { createStandingWorld } from "./testStandingWorld";
import type { StandingTestWorld } from "./testStandingWorld";

function kinds(world: StandingTestWorld, orderId: number): BlockedReasonKind[] {
  return standingReasons(world.engine, world.orderOf(orderId)).map((reason) => reason.kind);
}

function readyWorld(): StandingTestWorld {
  const world = createStandingWorld({ width: 20, height: 20 });
  world.userBoard();
  world.throneRoom(5, 5);
  world.steward(2);
  return world;
}

describe("standingReasons", () => {
  it("reports only Paused with the order id for a paused order", () => {
    const world = createStandingWorld();
    const id = world.standing();
    world.command("PauseStandingOrder", { orderId: id });
    const reasons = standingReasons(world.engine, world.orderOf(id));
    expect(reasons).toEqual([
      { kind: BlockedReasonKind.Paused, params: { standingOrderId: id }, causeRef: null },
    ]);
    expect(standingState(world.orderOf(id), reasons)).toBe(StandingOrderState.Paused);
  });

  it("reports NoSeatOfGovernment and NoSteward in the 025 precedence (US3.1, US3.2)", () => {
    const world = createStandingWorld();
    const id = world.standing();
    expect(kinds(world, id)).toEqual([
      BlockedReasonKind.NoSeatOfGovernment,
      BlockedReasonKind.NoSteward,
      BlockedReasonKind.NoReachableJobBoard,
    ]);
    const ready = readyWorld();
    const readyId = ready.standing();
    expect(kinds(ready, readyId)).toEqual([]);
  });

  it("is Satisfied or Restocking by the hysteresis bit while nothing blocks it", () => {
    const world = readyWorld();
    world.spawn("sawmill", 30);
    world.give(world.chest(31), "oak_log", 5);
    const id = world.standing();
    const order = world.orderOf(id);
    expect(standingState(order, standingReasons(world.engine, order))).toBe(
      StandingOrderState.Satisfied,
    );
    order.restocking = true;
    expect(standingReasons(world.engine, order)).toEqual([]);
    expect(standingState(order, [])).toBe(StandingOrderState.Restocking);
  });

  it("is Blocked while any reason other than Paused holds", () => {
    const world = createStandingWorld();
    const id = world.standing();
    const order = world.orderOf(id);
    expect(standingState(order, standingReasons(world.engine, order))).toBe(
      StandingOrderState.Blocked,
    );
  });

  it("reports ScopeZoneMissing for a zone order whose zone is gone (US5.4)", () => {
    const world = readyWorld();
    const zoneId = world.zone("stockpile", [60]);
    const id = world.standing({ scope: { zoneId } });
    expect(kinds(world, id)).toEqual([]);
    world.command("DeleteZone", { zoneId });
    world.run(2);
    expect(kinds(world, id)).toEqual([BlockedReasonKind.ScopeZoneMissing]);
  });

  it("reports LockedByTier for a recipe the tier has not unlocked", () => {
    const recipes = bundledContentFiles[ContentFile.Recipes];
    const content = loadContentPack({
      ...bundledContentFiles,
      [ContentFile.Recipes]: [
        ...(Array.isArray(recipes) ? recipes : []),
        {
          id: "smelt_ingot",
          name: "Smelt ingot",
          inputs: [{ materialId: "iron_ore", quantity: 2 }],
          outputs: [{ materialId: "iron_ingot", quantity: 1 }],
          durationTicks: 30,
          workstationTag: "workbench",
          unlockTier: "village",
        },
      ],
    });
    const world = createStandingWorld({ width: 20, height: 20, content });
    world.userBoard();
    world.throneRoom(5, 5);
    world.steward(2);
    const id = world.standing({ materialId: "iron_ingot", recipeId: "smelt_ingot" });
    getJobService(world.engine).setTierSource(() => "hamlet");
    const reasons = standingReasons(world.engine, world.orderOf(id));
    expect(reasons).toEqual([
      {
        kind: BlockedReasonKind.LockedByTier,
        params: { contentKind: "recipe", contentId: "smelt_ingot", requiredTier: "village" },
        causeRef: null,
      },
    ]);
  });

  it("reports AwaitingTownCrier while a run waits for a crier (US4.2)", () => {
    const world = readyWorld();
    world.spawn("sawmill", 30);
    const id = world.standing();
    world.runToReview();
    expect(kinds(world, id)).toContain(BlockedReasonKind.AwaitingTownCrier);
    world.crier(1);
    world.run(150);
    expect(kinds(world, id)).not.toContain(BlockedReasonKind.AwaitingTownCrier);
  });

  it("reports MissingWorkstation while restocking without a workstation that can make the recipe", () => {
    const world = readyWorld();
    const id = world.standing();
    world.orderOf(id).restocking = true;
    const reasons = standingReasons(world.engine, world.orderOf(id));
    expect(reasons).toEqual([
      {
        kind: BlockedReasonKind.MissingWorkstation,
        params: { workstationTag: "sawmill" },
        causeRef: null,
      },
    ]);
  });

  it("reports the production reasons of the delivered runs (MissingInput, US5)", () => {
    const world = readyWorld();
    world.spawn("sawmill", 30);
    world.crier(1);
    const id = world.standing();
    world.runToReview();
    world.run(150);
    const reasons = standingReasons(world.engine, world.orderOf(id));
    expect(reasons[0]).toMatchObject({
      kind: BlockedReasonKind.MissingInput,
      params: { materialId: "oak_log", noProducer: true },
    });
  });

  it("points a missing input at the standing order that makes it", () => {
    const world = readyWorld();
    world.spawn("oven", 30);
    world.spawn("grinding_mill", 32);
    const bread = world.standing({ materialId: "bread" });
    const flour = world.standing({
      materialId: "flour",
      recipeId: "grind_flour",
      targetQuantity: 10,
    });
    runStewardReview(world.engine, world.engine.time.tickCount + 1);
    world.orderOf(bread).restocking = true;
    const missing = standingReasons(world.engine, world.orderOf(bread)).find(
      (reason) => reason.kind === BlockedReasonKind.MissingInput,
    );
    expect(missing).toMatchObject({
      params: { materialId: "flour", noProducer: false },
      causeRef: { kind: StatusSubjectKind.StandingOrder, id: flour },
    });
  });
});
