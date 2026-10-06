import { describe, expect, it } from "vitest";
import { getJobService } from "../jobs/jobServiceRegistry";
import { setSitePriority } from "./constructionSites";
import { SiteKind, SiteStatus } from "./constructionTypes";
import { buildMenuView, buildQueueView, buildSiteDetail } from "./constructionViews";
import { createConstructionWorld } from "./testConstructionWorld";
import { loadVillageBakeryContent } from "../content/loadVillageBakeryContent";

describe("buildSiteDetail", () => {
  it("describes a job and is plain JSON", () => {
    const world = createConstructionWorld({ content: loadVillageBakeryContent() });
    const job = world.place("door", 44);
    world.give(world.site(job).entity, "oak_plank", 1);
    const view = buildSiteDetail(world.engine, job);
    expect(view).toMatchObject({
      jobId: job,
      kind: SiteKind.Construct,
      prototypeId: "door",
      status: SiteStatus.Planned,
      cellIndex: 44,
      mapId: world.mapId,
      required: [
        { materialId: "oak_plank", quantity: 2 },
        { materialId: "nails", quantity: 2 },
      ],
      delivered: [
        { materialId: "oak_plank", quantity: 1 },
        { materialId: "nails", quantity: 0 },
      ],
      progress: 0,
      builderId: null,
    });
    expect(view?.blockers.map((blocker) => blocker.kind)).toEqual(["MissingInput", "MissingInput"]);
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });

  it("is null for a job that does not exist", () => {
    const world = createConstructionWorld({ content: loadVillageBakeryContent() });
    expect(buildSiteDetail(world.engine, 4242)).toBeNull();
  });
});

describe("buildQueueView", () => {
  it("orders live jobs by priority, urgency and id and filters by map", () => {
    const world = createConstructionWorld({ content: loadVillageBakeryContent() });
    const first = world.place("wall", 30);
    const second = world.place("wall", 31, { priority: 80 });
    const third = world.place("wall", 32);
    setSitePriority(world.engine, third, 50, true);
    const queue = buildQueueView(world.engine);
    expect(queue.jobs.map((job) => job.jobId)).toEqual([second, third, first]);
    expect(buildQueueView(world.engine, world.mapId).jobs).toHaveLength(3);
    expect(buildQueueView(world.engine, 99).jobs).toEqual([]);
  });

  it("remembers finished jobs for the recent list", () => {
    const world = createConstructionWorld({ content: loadVillageBakeryContent() });
    const job = world.place("wall", 30);
    world.command("CancelConstructionJob", { jobId: job });
    const queue = buildQueueView(world.engine);
    expect(queue.jobs).toEqual([]);
    expect(queue.recent).toMatchObject([
      { jobId: job, prototypeId: "wall", status: SiteStatus.Cancelled, cellIndex: 30 },
    ]);
    expect(buildQueueView(world.engine, 99).recent).toEqual([]);
  });
});

describe("buildMenuView", () => {
  it("lists every definition and marks locked ones with the unlock text", () => {
    const world = createConstructionWorld({ content: loadVillageBakeryContent() });
    getJobService(world.engine).setTierSource(() => "hamlet");
    const menu = buildMenuView(world.engine);
    expect(menu.map((entry) => entry.id)).toEqual(
      world.engine.content.furniture.all().map((definition) => definition.id),
    );
    const oven = menu.find((entry) => entry.id === "oven");
    expect(oven).toMatchObject({
      locked: true,
      unlockText: "Unlocks at Village",
      unlockTier: "village",
      materials: [{ materialId: "stone_block", quantity: 6 }],
    });
    expect(menu.find((entry) => entry.id === "chest")).toMatchObject({
      locked: false,
      unlockText: null,
      constructionTicks: 18,
    });
  });
});
