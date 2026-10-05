import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { BlockReason } from "../map/mapTypes";
import { PathfindingService } from "../pathfinding/PathfindingService";
import { PathResultKind } from "../pathfinding/pathTypes";
import { insertSite, wallPrototypeId } from "./insertSite";
import { SiteGenerator, SiteScenario } from "./SiteGenerator";

describe("insertSite", () => {
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
});
