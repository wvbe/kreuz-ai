import { describe, expect, it } from "vitest";
import { GameSession } from "../api/GameSession";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { registerProduction } from "./registerProduction";
import { createProductionWorld } from "./testProductionWorld";

function view(
  world: ReturnType<typeof createProductionWorld>,
  query: string,
  args: { [name: string]: number },
) {
  const registration = world.engine.getQuery(query);
  if (registration === undefined) {
    throw new Error(`no query ${query}`);
  }
  return registration.run(args, world.engine);
}

describe("registerProduction", () => {
  it("is idempotent and the engine registers it for itself", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    expect(engine.getCommandHandler("CreateProductionOrder")).toBeDefined();
    expect(() => registerProduction(engine)).not.toThrow();
    expect(engine.getCommandHandler("CancelCraft")).toBeDefined();
  });

  it("spawns real workstation furniture by prototype id", () => {
    const world = createProductionWorld();
    for (const id of ["oven", "grinding_mill", "sawmill", "workbench"]) {
      const station = world.station(id, 22);
      expect(station.components["Furniture"]).toEqual({ furnitureId: id });
      expect(station.components["ProductionOrders"]).toEqual({ orders: [], craft: null });
      expect(station.components["Inventory"]).toMatchObject({ queryable: false, slotCount: 12 });
    }
    expect(view(world, "workstations", {})).toHaveLength(4);
  });

  it("commands create, pause, reprioritize and cancel an order and answer the queries", () => {
    const world = createProductionWorld();
    const mill = world.station("grinding_mill", 22);
    const result = world.command("CreateProductionOrder", {
      recipeId: "grind_flour",
      quantity: 3,
      priority: 40,
    });
    expect(result).toEqual({ orderId: 1, workstationId: mill.id });
    expect(view(world, "production-orders", { workstationId: mill.id })).toEqual([
      expect.objectContaining({ orderId: 1, quantity: 3, priority: 40, status: "active" }),
    ]);
    expect(view(world, "order", { orderId: 1 })).toMatchObject({ orderId: 1 });
    expect(view(world, "recipes-for", { workstationId: mill.id })).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "grind_flour" })]),
    );
    expect(world.command("SetProductionOrderPriority", { orderId: 1, priority: 80 })).toEqual({
      orderId: 1,
    });
    expect(world.command("SetProductionOrderPaused", { orderId: 1, paused: true })).toEqual({
      orderId: 1,
    });
    expect(world.data(mill).orders[0]).toMatchObject({ priority: 80, status: "paused" });
    expect(world.command("CancelCraft", { workstationId: mill.id })).toEqual({
      interrupted: false,
    });
    expect(world.command("CancelProductionOrder", { orderId: 1 })).toEqual({ orderId: 1 });
    expect(world.data(mill).orders[0]?.status).toBe("cancelled");
  });

  it("rejects bad payloads and unknown ids through the session", () => {
    const session = new GameSession(loadContent());
    session.newGame({ seed: 1 });
    session.step(1);
    const bad = session.dispatch({ kind: "CreateProductionOrder", recipeId: "grind_flour" });
    expect(bad.ok).toBe(false);
    const unknown = session.dispatch({ kind: "CancelProductionOrder", orderId: 5 });
    session.step(1);
    expect(unknown.ok).toBe(true);
    expect(session.query.run("order", { orderId: 5 })).toEqual({ ok: true, data: null });
  });
});
