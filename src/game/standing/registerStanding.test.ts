import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { TickSlot } from "../engine/TickPipeline";
import { getStatusService } from "../status/statusServiceRegistry";
import { StatusSubjectKind } from "../status/statusTypes";
import { registerStanding } from "./registerStanding";
import { getStandingService } from "./standingServiceRegistry";
import { StandingOrderScope } from "./standingTypes";
import { createStandingWorld } from "./testStandingWorld";

describe("registerStanding", () => {
  it("is idempotent", () => {
    const world = createStandingWorld();
    expect(registerStanding(world.engine)).toBe(registerStanding(world.engine));
    expect(registerStanding(world.engine)).toBe(getStandingService(world.engine));
  });

  // @covers 026:FR-005
  it("registers the commands, the queries and the status provider", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    expect(engine.commandKinds()).toEqual(
      expect.arrayContaining([
        "CreateStandingOrder",
        "UpdateStandingOrder",
        "PauseStandingOrder",
        "ResumeStandingOrder",
        "DeleteStandingOrder",
        "AppointSteward",
        "DismissSteward",
        "SetStewardBoard",
        "RequestStewardReview",
      ]),
    );
    expect(engine.queryNames()).toEqual(
      expect.arrayContaining(["standing-orders", "standing-order", "steward"]),
    );
    expect(
      getStatusService(engine)
        .providers()
        .map((provider) => provider.kind),
    ).toContain(StatusSubjectKind.StandingOrder);
  });

  // @covers 026:FR-008
  it("runs the system at the steward slot, after the housing evaluation (D-19)", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    const order = engine.pipeline.getSystemOrder();
    const housing = order.find((system) => system.id === "housing");
    const standing = order.find((system) => system.id === "standing");
    expect(housing?.slot).toBe(TickSlot.HousingDay);
    expect(standing?.slot).toBe(TickSlot.StewardDay);
    expect(TickSlot.HousingDay).toBeLessThan(TickSlot.StewardDay);
    expect(TickSlot.StewardDay).toBeLessThan(TickSlot.TierDay);
    const housingAt = order.findIndex((system) => system.id === "housing");
    const standingAt = order.findIndex((system) => system.id === "standing");
    expect(housingAt).toBeLessThan(standingAt);
  });

  // @covers 026:FR-005
  it("creates, edits, pauses, resumes and deletes orders through the commands", () => {
    const world = createStandingWorld();
    const id = world.standing({ materialId: "bread", priority: 60 });
    expect(world.command("UpdateStandingOrder", { orderId: id, targetQuantity: 30 })).toEqual({
      orderId: id,
    });
    expect(world.orderOf(id)).toMatchObject({
      targetQuantity: 30,
      restockThreshold: 15,
      priority: 60,
    });
    world.command("PauseStandingOrder", { orderId: id });
    expect(world.orderOf(id).paused).toBe(true);
    world.command("ResumeStandingOrder", { orderId: id });
    expect(world.orderOf(id).paused).toBe(false);
    world.command("DeleteStandingOrder", { orderId: id });
    expect(getStandingService(world.engine).find(id)).toBeUndefined();
  });

  it("takes a zone scope and a settlement scope and rejects other payloads", () => {
    const world = createStandingWorld();
    const zoneId = world.zone("stockpile", [40]);
    const zoned = world.standing({ materialId: "bread", scope: { zoneId } });
    expect(world.orderOf(zoned).scope).toBe(StandingOrderScope.Zone);
    const whole = world.standing({
      materialId: "flour",
      recipeId: "grind_flour",
      scope: "settlement",
    });
    expect(world.orderOf(whole).scope).toBe(StandingOrderScope.Settlement);
    expect(() =>
      world.command("CreateStandingOrder", { materialId: "oak_plank", scope: "x" }),
    ).toThrow();
    expect(() =>
      world.command("CreateStandingOrder", {
        materialId: "oak_plank",
        targetQuantity: 5,
        extra: 1,
      }),
    ).toThrow();
  });

  // @covers 026:FR-005
  it("appoints and dismisses the Steward, sets his board and asks for a review", () => {
    const world = createStandingWorld();
    const settler = world.settler(22);
    expect(world.command("AppointSteward", { entityId: settler.id })).toEqual({ changed: true });
    expect(world.query("steward")).toMatchObject({ stewardEntityId: settler.id });
    world.userBoard();
    expect(world.command("SetStewardBoard", { boardId: world.boardId })).toEqual({
      boardId: world.boardId,
    });
    expect(world.command("RequestStewardReview", {})).toEqual({ requested: true });
    expect(world.query("steward")).toMatchObject({
      stewardBoardId: world.boardId,
      extraReviewRequested: true,
    });
    expect(world.command("DismissSteward", {})).toEqual({ changed: true });
    expect(world.query("steward")).toMatchObject({ stewardEntityId: null });
  });

  it("answers the queries and gives null for an unknown order", () => {
    const world = createStandingWorld();
    const id = world.standing({ materialId: "bread" });
    expect(world.query("standing-orders")).toHaveLength(1);
    expect(world.query("standing-order", { orderId: id })).toMatchObject({ orderId: id });
    expect(world.query("standing-order", { orderId: 99 })).toBeNull();
  });

  it("vacates the office of a Steward who died and prunes finished runs every tick", () => {
    const world = createStandingWorld();
    const settler = world.steward(22);
    const dismissed = world.record("steward.dismissed");
    world.engine.store.requestDelete(settler.id);
    world.run(2);
    expect(dismissed).toEqual([{ entityId: settler.id, reason: "Died" }]);
  });

  it("forgets orders and the Steward on a new game", () => {
    const world = createStandingWorld();
    world.standing({ materialId: "bread" });
    world.steward(22);
    world.engine.newGame({ seed: 3 });
    expect(getStandingService(world.engine).state.orders).toEqual([]);
    expect(getStandingService(world.engine).state.stewardEntityId).toBeNull();
  });

  // @covers 026:FR-026 026:SC-005
  it("saves and loads the orders, the runs on the way and the Steward (spec 026 FR-026)", () => {
    const world = createStandingWorld({ width: 20, height: 20 });
    world.userBoard();
    world.throneRoom(5, 5);
    const steward = world.steward(2);
    world.crier(1);
    world.spawn("sawmill", 30);
    world.standing();
    world.runToReview();
    world.command("SetStewardBoard", { boardId: world.boardId });
    const before = JSON.parse(JSON.stringify(getStandingService(world.engine).state)) as object;
    expect(getStandingService(world.engine).state.runs.length).toBeGreaterThan(0);
    const text = world.engine.saveGame();
    world.engine.newGame({ seed: 3 });
    expect(getStandingService(world.engine).state.orders).toEqual([]);
    world.engine.loadGame(text);
    expect(getStandingService(world.engine).state).toEqual(before);
    expect(getStandingService(world.engine).state.stewardEntityId).toBe(steward.id);
    expect(JSON.parse(world.engine.saveGame()).stewardship).toEqual(before);
  });
});
