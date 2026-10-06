import { describe, expect, it } from "vitest";
import { getAiService } from "../ai/aiServiceRegistry";
import { DwellingLevel } from "../content/contentTypes";
import { GameEngine } from "../engine/GameEngine";
import { loadContent } from "../content/ContentLoader";
import { getSettlementService } from "../settlement/settlementServiceRegistry";
import { getStatusService } from "../status/statusServiceRegistry";
import { StatusSubjectKind } from "../status/statusTypes";
import { assignHome } from "./household";
import { registerHousing } from "./registerHousing";
import { asRecords, createHousingWorld } from "./testHousingWorld";

const options = { width: 20, height: 12 };

describe("registerHousing", () => {
  it("is idempotent", () => {
    const world = createHousingWorld();
    expect(registerHousing(world.engine)).toBe(registerHousing(world.engine));
  });

  it("installs the dwelling counter of the settlement tiers (D-57)", () => {
    const world = createHousingWorld(options);
    world.dwelling(1, 2);
    const second = world.dwelling(6, 2);
    world.setLevel(second, DwellingLevel.Cottage);
    const settlement = getSettlementService(world.engine);
    expect(settlement.countDwellingsAtOrAbove(DwellingLevel.Hovel)).toBe(2);
    expect(settlement.countDwellingsAtOrAbove(DwellingLevel.Cottage)).toBe(1);
  });

  it("registers the Dwelling status provider", () => {
    const world = createHousingWorld();
    const kinds = getStatusService(world.engine)
      .providers()
      .map((provider) => provider.kind);
    expect(kinds).toContain(StatusSubjectKind.Dwelling);
  });

  it("registers the system at the housing slot with its queries and no commands", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    expect(engine.queryNames()).toEqual(
      expect.arrayContaining(["dwellings", "dwelling", "housing", "dwellings-at-or-above"]),
    );
    expect(engine.commandKinds().filter((kind) => /dwelling|housing/i.test(kind))).toEqual([]);
  });

  it("answers the dwelling queries", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(1, 2, { beds: 2 });
    const settler = world.settler(200);
    assignHome(world.engine, settler.id, zone, 3);
    const rows = asRecords(world.query("dwellings"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: zone, level: "hovel", residents: [settler.id] });
    expect(world.query("dwelling", { id: zone })).toMatchObject({ id: zone, nextLevel: "cottage" });
    expect(world.query("dwelling", { id: 999 })).toBeNull();
    expect(world.query("housing")).toMatchObject({ dwellings: 1, housed: 1, homeless: 0 });
    expect(world.query("dwellings-at-or-above", { level: "hovel" })).toBe(1);
    expect(world.query("dwellings-at-or-above", { level: "cottage" })).toBe(0);
  });

  it("gives household beds to their residents only, who prefer them (FR-017)", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(1, 2, { beds: 1 });
    const plain = world.spawn("furniture_piece", 200, { Furniture: { furnitureId: "wooden_bed" } });
    const resident = world.settler(201);
    const stranger = world.settler(202);
    assignHome(world.engine, resident.id, zone, 0);
    const bed = world.engine.store
      .entities()
      .find((entity) => entity.id !== plain.id && entity.prototype === "furniture_piece");
    const service = getAiService(world.engine);
    expect(service.bedRank(world.engine, resident, bed ?? plain)).toBe(0);
    expect(service.bedRank(world.engine, stranger, bed ?? plain)).toBeNull();
    expect(service.bedRank(world.engine, resident, plain)).toBe(1);
    expect(service.bedRank(world.engine, stranger, plain)).toBe(1);
  });

  it("round-trips the housing state through a save (FR-021, SC-007)", () => {
    const world = createHousingWorld(options);
    world.throneRoom(12, 2);
    const zone = world.dwelling(1, 2, { columns: 3, rows: 2, beds: 4 });
    world.settler(200);
    world.runEvaluations(2);
    const saved = world.engine.saveGame();
    const copy = new GameEngine(world.engine.content, { entropy: () => 1 });
    copy.loadGame(saved);
    expect(copy.getStateHash()).toBe(world.engine.getStateHash());
    const view = (engine: GameEngine): string =>
      JSON.stringify(engine.getQuery("dwelling")?.run({ id: zone }, engine));
    expect(view(copy)).toBe(view(world.engine));
    // Both engines go on to the same next day.
    copy.runTicks(288);
    world.engine.runTicks(288);
    expect(copy.getStateHash()).toBe(world.engine.getStateHash());
  });
});
