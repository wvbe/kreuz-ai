import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { getGatheringService } from "./gatheringServiceRegistry";
import { CropStage } from "./gatheringTypes";
import { registerGathering } from "./registerGathering";
import { createGatheringWorld } from "./testGatheringWorld";

describe("registerGathering", () => {
  it("is idempotent and returns the engine's service", () => {
    const world = createGatheringWorld();
    expect(registerGathering(world.engine)).toBe(getGatheringService(world.engine));
  });

  it("answers the crops query, with an optional zone filter", () => {
    const world = createGatheringWorld();
    const zoneId = world.field(world.rect(2, 2, 2, 2));
    const query = world.engine.getQuery("crops");
    expect(query).toBeDefined();
    const all = query?.run({}, world.engine);
    expect(Array.isArray(all) ? all.length : -1).toBe(4);
    const none = query?.run({ zoneId: zoneId + 100 }, world.engine);
    expect(none).toEqual([]);
  });

  it("grows a crop in the tick pipeline, and a save in the middle of growth loads identically", () => {
    const world = createGatheringWorld();
    world.field(world.rect(2, 2, 2, 2));
    world.run(10);
    const service = getGatheringService(world.engine);
    service.setPlot({
      mapId: world.mapId,
      cellIndex: 22,
      materialId: "wheat",
      stage: CropStage.Sown,
      growthMilli: 0,
    });
    world.run(100);
    expect(service.plotAt(world.mapId, 22)?.growthMilli).toBe(100_000);
    const saved = world.engine.saveGame();
    const copy = new GameEngine(loadContent(), { entropy: () => 1 });
    copy.loadGame(saved);
    expect(getGatheringService(copy).plotAt(world.mapId, 22)?.growthMilli).toBe(100_000);
    expect(copy.getStateHash()).toBe(world.engine.getStateHash());
    copy.runTicks(764);
    world.run(764);
    expect(getGatheringService(copy).plotAt(world.mapId, 22)?.stage).toBe(CropStage.Ripe);
    expect(copy.getStateHash()).toBe(world.engine.getStateHash());
  });
});
