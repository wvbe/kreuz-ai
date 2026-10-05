import { describe, expect, it } from "vitest";
import { contentWithZones, createZoneWorld } from "./testZoneWorld";

describe("createZoneWorld", () => {
  it("designates zones, tracks zone events and builds rooms", () => {
    const world = createZoneWorld();
    const [zoneId] = world.designate("stockpile", world.rect(2, 2, 2, 2));
    expect(world.zoneData(zoneId ?? 0).tiles).toEqual([22, 23, 32, 33]);
    world.run(1);
    expect(world.events.map((event) => event.name)).toEqual([
      "zone.created",
      "zone.requirements.met",
    ]);
    const walls = world.walls(5, 5, 2, 2, [44]);
    expect(walls.size).toBe(11);
    expect(walls.has(44)).toBe(false);
    expect(world.door(44).prototype).toBe("door");
    expect(world.wall(90).prototype).toBe("wall");
    expect(world.furniture(91, "oven").components["Furniture"]).toEqual({ furnitureId: "oven" });
  });

  it("rejects an unknown command and an unknown zone", () => {
    const world = createZoneWorld();
    expect(() => world.command("Nope", {})).toThrow();
    expect(() => world.zoneData(1)).toThrow();
  });

  it("builds content with extra zone types", () => {
    const content = contentWithZones([
      { id: "test_extra", name: "Extra", requiresRoom: false, minTiles: 1 },
    ]);
    expect(content.zones.has("test_extra")).toBe(true);
    expect(content.zones.has("bakery")).toBe(true);
  });
});
