import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { BlockReason } from "../map/mapTypes";
import { PathfindingService } from "../pathfinding/PathfindingService";
import { PathResultKind } from "../pathfinding/pathTypes";
import { getTotal, requireInventory } from "../inventory/inventoryQueries";
import { insertSite, siteStarterKits, wallPrototypeId } from "./insertSite";
import { SiteGenerator, SiteScenario } from "./SiteGenerator";
import type { SiteRole } from "./SiteGenerator";

describe("insertSite", () => {
  // @covers 009:FR-002
  // @covers 009:FR-011
  // @covers 009:SC-004
  it("creates the map, wall entities and citizens of a site and the citizens can reach each other", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 3 });
    engine.newGame({ seed: 3 });
    const site = new SiteGenerator(engine.prng.stream("site.gen")).generate({
      scenario: SiteScenario.Navigation,
    });
    const inserted = insertSite(engine, site);
    const map = engine.maps.require(inserted.mapId);
    expect(map.params.generator).toBe("site");
    expect(inserted.wallIds).toHaveLength(site.walls.length);
    expect(inserted.entityIds).toHaveLength(site.entities.length);
    expect(engine.store.require(inserted.wallIds[0] ?? 0).prototype).toBe(wallPrototypeId);
    expect(map.blockReason(site.walls[0] ?? 0)).toBe(BlockReason.Wall);
    const service = new PathfindingService({
      maps: engine.maps,
      terrain: engine.content.terrain,
      bus: engine.bus,
    });
    const first = site.entities[0]?.cell ?? 0;
    for (const entity of site.entities) {
      expect(service.findPath(inserted.mapId, first, entity.cell).kind).not.toBe(
        PathResultKind.NoPath,
      );
    }
  });

  // @covers 009:FR-008 009:FR-009 009:SC-005
  it("gives merchants coins and goods, customers coins and workers tools, within the stack limits", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 3 });
    engine.newGame({ seed: 3 });
    const generator = new SiteGenerator(engine.prng.stream("site.gen"));
    const trade = insertSite(engine, generator.generate({ scenario: SiteScenario.Trade }));
    const work = insertSite(engine, generator.generate({ scenario: SiteScenario.Interaction }));
    const site = generator.generate({ scenario: SiteScenario.Trade, seed: 5 });
    const inserted = insertSite(engine, site);
    inserted.entityIds.forEach((id, index) => {
      const role = site.entities[index]?.role as SiteRole;
      const entity = engine.store.require(id);
      for (const [materialId, quantity] of siteStarterKits[role]) {
        expect(getTotal(entity, materialId)).toBeGreaterThanOrEqual(quantity);
      }
      const inventory = requireInventory(entity);
      for (const slot of inventory.slots) {
        expect(slot.quantity).toBeLessThanOrEqual(
          engine.materials.require(slot.materialId).stackLimit,
        );
      }
    });
    for (const id of trade.entityIds) {
      expect(getTotal(engine.store.require(id), "silver_penny")).toBeGreaterThan(0);
    }
    for (const id of work.entityIds) {
      expect(getTotal(engine.store.require(id), "iron_hammer")).toBeGreaterThanOrEqual(1);
    }
  });

  // @covers 009:FR-015 009:SC-006
  it("survives a save and load of the game byte for byte", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 3 });
    engine.newGame({ seed: 3 });
    const site = new SiteGenerator(engine.prng.stream("site.gen")).generate({
      scenario: SiteScenario.Interaction,
    });
    const inserted = insertSite(engine, site);
    engine.runTicks(3);
    const text = engine.saveGame();
    const resumed = new GameEngine(loadContent(), { entropy: () => 9 });
    resumed.loadGame(text);
    expect(resumed.getStateHash()).toBe(engine.getStateHash());
    expect(resumed.maps.require(inserted.mapId).params.generator).toBe("site");
    expect(resumed.getEntities().length).toBe(engine.getEntities().length);
  });
});
