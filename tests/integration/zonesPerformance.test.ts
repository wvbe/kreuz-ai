import { describe, expect, it } from "vitest";
import { createZoneWorld } from "../../src/game/zones/testZoneWorld";
import { getZoneService } from "../../src/game/zones/zoneServiceRegistry";

// Spec 015 SC-008: 200+ zones with continuous re-evaluation must stay under 20 ms per tick. The
// zones system re-derives every zone in each slot 9; this measures one such pass over 200 walled
// bedrooms with a bed each (a typical run takes a few milliseconds).
describe("zone evaluation performance (spec 015 SC-008)", () => {
  it("re-derives 200 zones in < 20 ms", () => {
    const world = createZoneWorld({ width: 110, height: 60 });
    for (let index = 0; index < 200; index += 1) {
      const column = 2 + (index % 20) * 5;
      const row = 2 + Math.floor(index / 20) * 5;
      world.walls(column, row, 3, 3);
      world.designate("bedroom", world.rect(column, row, 3, 3));
      world.furniture(row * 110 + column, "wooden_bed");
    }
    world.run(1);
    const service = getZoneService(world.engine);
    expect(service.zones()).toHaveLength(200);
    expect(service.zones().every((zone) => world.zoneData(zone.id).active)).toBe(true);
    const started = performance.now();
    service.evaluateAll(world.engine.time.tickCount, true);
    expect(performance.now() - started).toBeLessThan(20);
  });
});
