import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { getJobService } from "../jobs/jobServiceRegistry";
import { BlockReason } from "../map/mapTypes";
import { ConstructionService } from "./ConstructionService";
import { getConstructionService } from "./constructionServiceRegistry";
import { registerConstruction } from "./registerConstruction";
import { createConstructionWorld } from "./testConstructionWorld";
import { loadVillageBakeryContent } from "../content/loadVillageBakeryContent";

function query(world: ReturnType<typeof createConstructionWorld>, name: string, args: object) {
  const registration = world.engine.getQuery(name);
  if (registration === undefined) {
    throw new Error(`no query ${name}`);
  }
  return registration.run(args as never, world.engine);
}

describe("registerConstruction", () => {
  it("returns the engine's service and is idempotent", () => {
    const world = createConstructionWorld({ content: loadVillageBakeryContent() });
    const service = getConstructionService(world.engine);
    expect(service).toBeInstanceOf(ConstructionService);
    expect(registerConstruction(world.engine)).toBe(service);
    const fresh = new GameEngine(loadContent(), { entropy: () => 1 });
    expect(registerConstruction(fresh)).toBe(getConstructionService(fresh));
  });

  it("registers the component, the prototype and the job types", () => {
    const world = createConstructionWorld({ content: loadVillageBakeryContent() });
    expect(world.engine.components.has("BuildSite")).toBe(true);
    expect(world.engine.prototypes.has("build_site")).toBe(true);
    expect(world.engine.taskHandlers.has("build.supply")).toBe(true);
    expect(world.engine.taskHandlers.has("build.construct")).toBe(true);
  });

  it("answers the blueprint commands", () => {
    const world = createConstructionWorld({ content: loadVillageBakeryContent() });
    const furniture = world.command("PlaceFurniture", {
      furnitureId: "table",
      mapId: world.mapId,
      cell: 30,
      priority: 70,
    }) as { jobId: number };
    expect(world.site(furniture.jobId).data).toMatchObject({ prototypeId: "table", priority: 70 });
    const walls = world.command("PlaceWall", { mapId: world.mapId, cells: [31, 32] }) as {
      jobIds: number[];
    };
    expect(walls.jobIds).toHaveLength(2);
    const door = world.command("PlaceDoor", { mapId: world.mapId, cell: 33 }) as {
      jobIds: number[];
    };
    expect(world.site(door.jobIds[0] ?? 0).data.prototypeId).toBe("door");
    const queued = world.command("QueueWalls", {
      prototypeId: "wall",
      mapId: world.mapId,
      cells: [34],
    }) as { jobIds: number[] };
    expect(queued.jobIds).toHaveLength(1);
    expect(world.command("CancelConstruction", { jobId: furniture.jobId })).toEqual({
      jobId: furniture.jobId,
    });
    expect(world.hasSite(furniture.jobId)).toBe(false);
  });

  it("answers the queue controls", () => {
    const world = createConstructionWorld({ content: loadVillageBakeryContent() });
    const job = world.place("wall", 30);
    world.command("SetConstructionJobPaused", { jobId: job, paused: true });
    expect(world.site(job).data.paused).toBe(true);
    world.command("SetConstructionPriority", { jobId: job, priority: 10, urgent: true });
    expect(world.site(job).data).toMatchObject({ priority: 10, urgent: true });
    world.command("MoveConstructionJobToFront", { jobId: job });
    expect(world.site(job).data.priority).toBe(100);
    const chest = world.chest(40);
    const down = world.command("QueueDeconstruction", { targetEntityId: chest.id }) as {
      jobId: number;
    };
    expect(world.site(down.jobId).data.targetEntityId).toBe(chest.id);
    expect(world.command("CancelConstructionJob", { jobId: job })).toEqual({ jobId: job });
  });

  it("rejects bad payloads", () => {
    const world = createConstructionWorld({ content: loadVillageBakeryContent() });
    expect(() => world.command("PlaceFurniture", { furnitureId: "table", mapId: 1 })).toThrow();
    expect(() =>
      world.command("QueueConstruction", {
        prototypeId: "table",
        mapId: world.mapId,
        cellIndex: 5,
        priority: 500,
      }),
    ).toThrow();
    expect(() => world.command("CancelConstructionJob", { jobId: 9999 })).toThrow();
  });

  it("answers the queries", () => {
    const world = createConstructionWorld({ content: loadVillageBakeryContent() });
    const job = world.place("wall", 30);
    expect(query(world, "site", { jobId: job })).toMatchObject({ jobId: job });
    expect(query(world, "site", { jobId: 9999 })).toBeNull();
    expect(query(world, "construction-queue", {})).toMatchObject({
      jobs: [{ jobId: job }],
      recent: [],
    });
    expect(
      query(world, "validate-placement", {
        prototypeId: "wall",
        mapId: world.mapId,
        cellIndex: 30,
      }),
    ).toMatchObject({ valid: false, reasons: [{ kind: "SiteExists" }] });
    getJobService(world.engine).setTierSource(() => "hamlet");
    const menu = query(world, "build-menu", {}) as { id: string; locked: boolean }[];
    expect(menu.find((entry) => entry.id === "oven")?.locked).toBe(true);
  });

  it("obstructs the cell of every wall that is spawned or loaded and frees it on delete", () => {
    const world = createConstructionWorld({ content: loadVillageBakeryContent() });
    const wall = world.wall(30);
    world.run(1);
    const map = world.engine.maps.require(world.mapId);
    expect(map.blockReason(30)).toBe(BlockReason.Wall);
    world.engine.loadGame(world.engine.saveGame());
    expect(world.engine.maps.require(world.mapId).blockReason(30)).toBe(BlockReason.Wall);
    world.engine.store.requestDelete(wall.id);
    world.run(1);
    expect(world.engine.maps.require(world.mapId).isTraversable(30)).toBe(true);
  });

  it("deleting a build site gives its goods back", () => {
    const world = createConstructionWorld({ content: loadVillageBakeryContent() });
    const job = world.place("wall", 30);
    world.give(world.site(job).entity, "stone_block", 2);
    world.engine.store.requestDelete(job);
    world.run(1);
    expect(world.count("stone_block")).toBe(2);
  });
});
