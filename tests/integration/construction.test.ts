import { describe, expect, it } from "vitest";
import { getAiService } from "../../src/game/ai/aiServiceRegistry";
import { listSites } from "../../src/game/construction/buildSiteQueries";
import { SiteKind, SiteStatus } from "../../src/game/construction/constructionTypes";
import { createConstructionWorld } from "../../src/game/construction/testConstructionWorld";
import type { ConstructionTestWorld } from "../../src/game/construction/testConstructionWorld";
import { getComponent } from "../../src/game/ecs/Entity";
import type { Entity } from "../../src/game/ecs/Entity";
import { PathResultKind } from "../../src/game/pathfinding/pathTypes";
import { positionComponent } from "../../src/game/map/positionComponent";
import { skillsComponent } from "../../src/game/skills/skillsComponent";
import { ZoneStatus } from "../../src/game/zones/zoneTypes";

function names(world: ConstructionTestWorld, name: string) {
  return world.built.filter((event) => event.name === name);
}

function entitiesOf(world: ConstructionTestWorld, prototype: string): Entity[] {
  return world.engine.store.entities().filter((entity) => entity.prototype === prototype);
}

function stocked(materials: { materialId: string; quantity: number }[]) {
  const world = createConstructionWorld();
  const chest = world.chest(55);
  for (const item of materials) {
    world.give(chest, item.materialId, item.quantity);
  }
  const settler = world.settler(11);
  world.feed([settler]);
  return { world, chest, settler };
}

function allMaterials(world: ConstructionTestWorld): number {
  return ["stone_block", "oak_plank", "nails"].reduce((sum, id) => sum + world.count(id), 0);
}

describe("016 build a wall from stocked stone", () => {
  it("supplies, builds, places the wall and conserves the stone", () => {
    const { world, chest } = stocked([{ materialId: "stone_block", quantity: 5 }]);
    const id = world.place("wall", 44);
    expect(world.site(id).data.status).toBe(SiteStatus.Planned);
    expect(world.site(id).data.required).toEqual([{ materialId: "stone_block", quantity: 1 }]);
    world.runUntil(() => !world.hasSite(id), 600);
    expect(world.hasSite(id)).toBe(false);
    const walls = entitiesOf(world, "wall");
    expect(walls).toHaveLength(1);
    expect(getComponent(walls[0] as Entity, positionComponent)?.cellIndex).toBe(44);
    expect(world.engine.maps.require(world.mapId).isTraversable(44)).toBe(false);
    expect(world.count("stone_block")).toBe(4);
    expect(world.count("stone_block")).toBe(
      (chest.components["Inventory"] as { slots: { quantity: number }[] }).slots.reduce(
        (sum, slot) => sum + slot.quantity,
        0,
      ),
    );
    expect(names(world, "construction.job.queued")).toHaveLength(1);
    expect(names(world, "construction.job.claimed")).toHaveLength(1);
    expect(names(world, "construction.job.started")).toHaveLength(1);
    const done = names(world, "construction.job.completed");
    expect(done).toHaveLength(1);
    expect(done[0]?.payload).toMatchObject({
      jobId: id,
      kind: SiteKind.Construct,
      prototypeId: "wall",
      cellIndex: 44,
      consumed: [{ materialId: "stone_block", quantity: 1 }],
      yield: [],
    });
    // The work phase takes exactly the base duration of an unskilled builder.
    const started = names(world, "construction.job.started")[0]?.tick ?? 0;
    expect((done[0]?.tick ?? 0) - started).toBe(16);
  });

  it("scales the work with the construction skill and emits the skill event once", () => {
    const slow = stocked([{ materialId: "stone_block", quantity: 2 }]);
    const skilled = stocked([{ materialId: "stone_block", quantity: 2 }]);
    const skills = getComponent(skilled.settler, skillsComponent);
    if (skills === undefined) {
      throw new Error("settler has no skills");
    }
    skills.values["construction"] = 100_000;
    const seen: string[] = [];
    skilled.world.engine.bus.subscribe("skill.work.completed", (payload) => {
      seen.push(JSON.stringify(payload));
    });
    for (const { world } of [slow, skilled]) {
      const id = world.place("wall", 44);
      world.runUntil(() => !world.hasSite(id), 600);
    }
    const duration = (world: ConstructionTestWorld) =>
      (names(world, "construction.job.completed")[0]?.tick ?? 0) -
      (names(world, "construction.job.started")[0]?.tick ?? 0);
    expect(duration(skilled.world)).toBeLessThan(duration(slow.world));
    skilled.world.run(2);
    expect(seen.filter((entry) => entry.includes("construction"))).toHaveLength(1);
  });

  it("shows progress while the builder works", () => {
    const { world } = stocked([{ materialId: "stone_block", quantity: 2 }]);
    const id = world.place("wall", 44);
    world.runUntil(() => names(world, "construction.job.started").length === 1, 600);
    world.run(5);
    const view = world.engine.getQuery("site")?.run({ jobId: id }, world.engine) as {
      progress: number;
      durationTicks: number;
      status: string;
    };
    expect(view.durationTicks).toBe(16);
    expect(view.progress).toBe(5);
    expect(view.status).toBe(SiteStatus.Building);
  });
});

describe("016 furniture completion feeds the zones", () => {
  it("builds an oven into a bakery and the zone turns active", () => {
    const world = createConstructionWorld();
    const chest = world.chest(90);
    world.stockFor(chest, "oven");
    const cells = world.rect(2, 2, 2, 2);
    world.walls(2, 2, 2, 2, [31]);
    world.door(31);
    const [zoneId] = world.designate("bakery", cells);
    world.feed([world.settler(77)]);
    world.run(3);
    expect(world.zoneData(zoneId ?? 0).status).toBe(ZoneStatus.Incomplete);
    const id = world.place("oven", cells[0] ?? 0);
    // A blueprint is no furniture: the zone stays incomplete until the oven stands.
    world.run(2);
    expect(world.zoneData(zoneId ?? 0).status).toBe(ZoneStatus.Incomplete);
    world.runUntil(() => !world.hasSite(id), 800);
    world.run(1);
    const ovens = entitiesOf(world, "oven");
    expect(ovens).toHaveLength(1);
    expect(ovens[0]?.components["ProductionOrders"]).toEqual({ orders: [], craft: null });
    expect(world.zoneData(zoneId ?? 0).status).toBe(ZoneStatus.Active);
    expect(
      world.events.filter((event) => event.name === "zone.requirements.met").length,
    ).toBeGreaterThan(0);
  });

  it("builds a plain furniture piece with the furniture component", () => {
    const { world } = stocked([{ materialId: "oak_plank", quantity: 3 }]);
    const id = world.place("table", 44);
    world.runUntil(() => !world.hasSite(id), 600);
    const pieces = entitiesOf(world, "furniture_piece");
    expect(pieces).toHaveLength(1);
    expect(pieces[0]?.components["Furniture"]).toEqual({ furnitureId: "table" });
  });
});

describe("016 walls block pathfinding", () => {
  it("makes a finished wall impassable and routes around it", () => {
    const { world } = stocked([{ materialId: "stone_block", quantity: 2 }]);
    const pathfinding = getAiService(world.engine).pathfinding;
    const before = pathfinding.findPath(world.mapId, 40, 49);
    expect(before.kind).toBe(PathResultKind.Found);
    const id = world.place("wall", 44);
    // The blueprint does not block.
    expect(world.engine.maps.require(world.mapId).isTraversable(44)).toBe(true);
    world.runUntil(() => !world.hasSite(id), 600);
    const after = pathfinding.findPath(world.mapId, 40, 49);
    expect(after.kind).toBe(PathResultKind.Found);
    expect(after.kind === PathResultKind.Found ? after.cells.includes(44) : true).toBe(false);
    expect(
      (before.kind === PathResultKind.Found ? before.cost : 0) <
        (after.kind === PathResultKind.Found ? after.cost : 0),
    ).toBe(true);
  });

  it("restores the path when the wall is taken down", () => {
    const { world } = stocked([{ materialId: "stone_block", quantity: 4 }]);
    const pathfinding = getAiService(world.engine).pathfinding;
    const id = world.place("wall", 44);
    world.runUntil(() => !world.hasSite(id), 600);
    const wall = entitiesOf(world, "wall")[0] as Entity;
    const map = world.engine.maps.require(world.mapId);
    expect(map.isTraversable(44)).toBe(false);
    const down = world.command("QueueDeconstruction", { targetEntityId: wall.id }) as {
      jobId: number;
    };
    world.runUntil(() => !world.hasSite(down.jobId), 600);
    world.run(1);
    expect(entitiesOf(world, "wall")).toHaveLength(0);
    expect(map.isTraversable(44)).toBe(true);
    expect(pathfinding.findPath(world.mapId, 43, 45).kind).toBe(PathResultKind.Found);
    const done = names(world, "construction.job.completed").at(-1)?.payload;
    expect(done).toMatchObject({
      kind: SiteKind.Deconstruct,
      consumed: [],
      yield: [{ materialId: "stone_block", quantity: 1 }],
    });
  });
});

describe("016 no double claim", () => {
  it("never gives a site two builders or a builder two sites", () => {
    const world = createConstructionWorld();
    const chest = world.chest(55);
    world.stockFor(chest, "wall", 6);
    const settlers = [world.settler(11), world.settler(12), world.settler(13), world.settler(14)];
    world.feed(settlers);
    const ids = [30, 31, 32, 33, 34, 35].map((cell) => world.place("wall", cell));
    for (let tick = 0; tick < 700; tick += 1) {
      world.run(1);
      const builders = listSites(world.engine)
        .map((site) => site.data.builderId)
        .filter((builder) => builder !== null);
      expect(new Set(builders).size).toBe(builders.length);
      const suppliers = listSites(world.engine)
        .map((site) => site.data.supplierId)
        .filter((supplier) => supplier !== null);
      expect(new Set(suppliers).size).toBe(suppliers.length);
      for (const site of listSites(world.engine)) {
        const claimed = world.engine.store
          .entities()
          .filter((entity) =>
            world.engine.tasks
              .getQueue(entity.id)
              ?.tasks.some(
                (task) =>
                  task.type === "build.construct" &&
                  (task.data as { siteId: number | null }).siteId === site.entity.id,
              ),
          );
        expect(claimed.length).toBeLessThanOrEqual(1);
      }
      if (tick % 40 === 0) {
        world.feed(settlers);
      }
    }
    expect(ids.every((id) => !world.hasSite(id))).toBe(true);
    expect(entitiesOf(world, "wall")).toHaveLength(6);
    expect(world.count("stone_block")).toBe(0);
  });
});

describe("016 suspension and resume", () => {
  it("suspends without materials and resumes when stone appears", () => {
    const { world, chest } = stocked([]);
    const id = world.place("wall", 44);
    world.run(30);
    expect(names(world, "construction.job.suspended")).toHaveLength(1);
    expect(names(world, "construction.job.suspended")[0]?.payload).toMatchObject({
      jobId: id,
      reason: { kind: "MissingInput", params: { materialId: "stone_block" } },
    });
    const view = world.engine.getQuery("site")?.run({ jobId: id }, world.engine) as {
      blockers: { kind: string }[];
    };
    expect(view.blockers.map((blocker) => blocker.kind)).toEqual(["MissingInput"]);
    world.give(chest, "stone_block", 2);
    world.runUntil(() => !world.hasSite(id), 600);
    expect(names(world, "construction.job.resumed")).toHaveLength(1);
    expect(names(world, "construction.job.completed")).toHaveLength(1);
  });
});

describe("016 cancel", () => {
  it("refunds delivered materials, frees the cell and withdraws the work at every stage", () => {
    const { world, chest } = stocked([{ materialId: "stone_block", quantity: 4 }]);
    const before = allMaterials(world);
    const id = world.place("wall", 44);
    // Cancel while the supplier is on its way or has delivered.
    world.runUntil(() => world.site(id).data.supplierId !== null, 100);
    world.command("CancelConstructionJob", { jobId: id });
    world.run(2);
    expect(world.hasSite(id)).toBe(false);
    expect(names(world, "construction.job.cancelled")).toHaveLength(1);
    expect(entitiesOf(world, "wall")).toHaveLength(0);
    expect(world.engine.maps.require(world.mapId).isTraversable(44)).toBe(true);
    world.run(200);
    expect(allMaterials(world)).toBe(before);
    expect(world.count("stone_block")).toBe(4);
    // The haul poster took everything back to storage.
    expect(
      (chest.components["Inventory"] as { slots: { quantity: number }[] }).slots.reduce(
        (sum, slot) => sum + slot.quantity,
        0,
      ),
    ).toBe(4);
    // The cell is free for a new blueprint.
    expect(() => world.place("wall", 44)).not.toThrow();
  });

  it("stops a builder in the middle of the work and places nothing", () => {
    const { world, settler } = stocked([{ materialId: "stone_block", quantity: 2 }]);
    const id = world.place("wall", 44);
    world.runUntil(() => names(world, "construction.job.started").length === 1, 600);
    world.run(4);
    world.command("CancelConstructionJob", { jobId: id });
    world.run(40);
    expect(entitiesOf(world, "wall")).toHaveLength(0);
    expect(names(world, "construction.job.completed")).toHaveLength(0);
    expect(world.count("stone_block")).toBe(2);
    expect(
      world.engine.tasks
        .getQueue(settler.id)
        ?.tasks.some((task) => task.type === "build.construct"),
    ).toBe(false);
  });
});

describe("016 interruption", () => {
  it("returns to pending when the builder vanishes and keeps the materials", () => {
    const world = createConstructionWorld();
    const chest = world.chest(55);
    world.stockFor(chest, "wall");
    const first = world.settler(11);
    world.feed([first]);
    const id = world.place("wall", 44);
    world.runUntil(() => names(world, "construction.job.started").length === 1, 600);
    world.run(3);
    expect(world.site(id).data.builderId).toBe(first.id);
    const second = world.settler(12);
    world.feed([second]);
    world.engine.store.requestDelete(first.id);
    world.run(2);
    expect(world.site(id).data.builderId).toBeNull();
    expect(world.site(id).data.progress).toBe(0);
    expect(world.site(id).data.status).toBe(SiteStatus.Building);
    world.runUntil(() => !world.hasSite(id), 600);
    expect(entitiesOf(world, "wall")).toHaveLength(1);
    expect(world.count("stone_block")).toBe(0);
  });
});

describe("016 deconstruction", () => {
  it("takes furniture down, drops the yield as a pile and hauls it to storage", () => {
    const { world, chest } = stocked([]);
    world.stockFor(chest, "workbench");
    const id = world.place("workbench", 44);
    world.runUntil(() => !world.hasSite(id), 600);
    const bench = entitiesOf(world, "workbench")[0] as Entity;
    const down = world.command("QueueDeconstruction", { targetEntityId: bench.id }) as {
      jobId: number;
    };
    expect(world.site(down.jobId).data.kind).toBe(SiteKind.Deconstruct);
    expect(world.site(down.jobId).data.status).toBe(SiteStatus.Building);
    world.runUntil(() => !world.hasSite(down.jobId), 600);
    world.run(150);
    expect(entitiesOf(world, "workbench")).toHaveLength(0);
    expect(world.count("oak_plank")).toBe(2);
    expect(
      (chest.components["Inventory"] as { slots: { quantity: number }[] }).slots.reduce(
        (sum, slot) => sum + slot.quantity,
        0,
      ),
    ).toBe(2);
  });
});

describe("016 queue controls", () => {
  it("skips paused jobs, honours priority and MoveToFront", () => {
    const world = createConstructionWorld();
    const chest = world.chest(55);
    world.stockFor(chest, "wall", 3);
    const low = world.place("wall", 30);
    const high = world.place("wall", 31, { priority: 90 });
    const third = world.place("wall", 32);
    world.command("SetConstructionJobPaused", { jobId: low, paused: true });
    world.command("MoveConstructionJobToFront", { jobId: third });
    const queue = world.engine.getQuery("construction-queue")?.run({}, world.engine) as {
      jobs: { jobId: number }[];
    };
    expect(queue.jobs.map((job) => job.jobId)).toEqual([third, high, low]);
    const settler = world.settler(11);
    world.feed([settler]);
    world.runUntil(() => !world.hasSite(third), 800);
    expect(world.hasSite(high)).toBe(true);
    world.runUntil(() => !world.hasSite(high), 800);
    // The paused job never started.
    expect(world.hasSite(low)).toBe(true);
    expect(world.site(low).data.postingId).toBeNull();
    world.command("SetConstructionJobPaused", { jobId: low, paused: false });
    world.runUntil(() => !world.hasSite(low), 800);
    expect(entitiesOf(world, "wall")).toHaveLength(3);
  });
});

describe("016 material conservation over 1000 ticks with cancels", () => {
  it("never loses or duplicates a material", () => {
    const world = createConstructionWorld();
    const chest = world.chest(55);
    world.stockFor(chest, "wall", 4);
    world.stockFor(chest, "door", 2);
    world.stockFor(chest, "oven", 1);
    world.stockFor(chest, "chest", 1);
    const settlers = [world.settler(11), world.settler(12), world.settler(13)];
    world.feed(settlers);
    const initial = allMaterials(world);
    const consumed = { value: 0 };
    world.engine.bus.subscribe("construction.job.completed", (payload) => {
      for (const item of (payload as { consumed: { quantity: number }[] }).consumed) {
        consumed.value += item.quantity;
      }
    });
    const ids = [
      world.place("wall", 30),
      world.place("wall", 31),
      world.place("door", 32),
      world.place("oven", 33),
      world.place("wall", 34),
      world.place("chest", 35),
    ];
    const cancelAt = new Map<number, number>([
      [ids[1] as number, 25],
      [ids[3] as number, 90],
      [ids[4] as number, 300],
    ]);
    for (let tick = 0; tick < 1000; tick += 1) {
      world.run(1);
      for (const [jobId, at] of cancelAt) {
        if (tick === at && world.hasSite(jobId)) {
          world.command("CancelConstructionJob", { jobId });
        }
      }
      if (tick % 40 === 0) {
        world.feed(settlers);
      }
      if (tick % 7 === 0) {
        expect(allMaterials(world) + consumed.value).toBe(initial);
      }
    }
    expect(allMaterials(world) + consumed.value).toBe(initial);
    expect(consumed.value).toBeGreaterThan(0);
  });
});

describe("016 save and load in the middle of construction", () => {
  it("resumes identically", () => {
    const build = () => {
      const world = createConstructionWorld();
      const chest = world.chest(55);
      world.stockFor(chest, "wall", 2);
      world.stockFor(chest, "door", 1);
      world.feed([world.settler(11), world.settler(12)]);
      world.place("wall", 30);
      world.place("wall", 31);
      world.place("door", 32);
      return world;
    };
    const world = build();
    world.runUntil(() => names(world, "construction.job.started").length >= 1, 600);
    world.run(7);
    const saved = world.engine.saveGame();
    const hash = world.engine.getStateHash();
    world.run(300);
    const continued = world.engine.getStateHash();
    world.engine.loadGame(saved);
    expect(world.engine.getStateHash()).toBe(hash);
    world.run(300);
    expect(world.engine.getStateHash()).toBe(continued);
    expect(entitiesOf(world, "wall").length + entitiesOf(world, "door").length).toBeGreaterThan(0);
  });
});
