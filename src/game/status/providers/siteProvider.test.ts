import { describe, expect, it } from "vitest";
import { noAiOverride } from "../../jobs/testJobWorld";
import { getJobService } from "../../jobs/jobServiceRegistry";
import { createStatusContext } from "../statusContext";
import { evaluateSubject, explain } from "../explain";
import { BlockedReasonKind, StatusState, StatusSubjectKind } from "../statusTypes";
import { createStatusWorld } from "../testStatusWorld";
import { siteProvider } from "./siteProvider";
import { loadVillageBakeryContent } from "../../content/loadVillageBakeryContent";

const site = (id: number) => ({ kind: StatusSubjectKind.ConstructionSite, id });

describe("siteProvider", () => {
  it("lists the live build sites", () => {
    const world = createStatusWorld({ content: loadVillageBakeryContent() });
    const first = world.place("wall", 44);
    const second = world.place("wall", 45);
    expect(siteProvider.subjects(world.engine)).toEqual([site(first), site(second)]);
    expect(
      siteProvider.evaluate(world.engine, site(999), createStatusContext(world.engine)),
    ).toBeNull();
  });

  it("is Blocked with MissingInput when no storage can supply a material and no producer exists", () => {
    const world = createStatusWorld({ content: loadVillageBakeryContent() });
    const id = world.place("wall", 44);
    const status = evaluateSubject(world.engine, site(id));
    expect(status?.state).toBe(StatusState.Blocked);
    expect(status?.reasons[0]).toEqual({
      kind: BlockedReasonKind.MissingInput,
      params: {
        materialId: "stone_block",
        required: 2,
        delivered: 0,
        available: 0,
        noProducer: true,
      },
      causeRef: null,
    });
  });

  it("points a missing material at the stalled producer of it", () => {
    const world = createStatusWorld({ content: loadVillageBakeryContent() });
    const mill = world.station("sawmill", 22);
    world.order({ workstationId: mill.id, recipeId: "saw_oak_planks", quantity: 1 });
    const id = world.place("door", 44);
    const explanation = explain(world.engine, site(id));
    const plank = explanation?.reasons.find(
      (reason) => reason.params["materialId"] === "oak_plank",
    );
    expect(plank?.params["noProducer"]).toBe(false);
    expect(plank?.causeRef).toEqual({ kind: StatusSubjectKind.Workstation, id: mill.id });
  });

  it("is Active when storage can supply it, and Blocked with Paused or LockedByTier otherwise", () => {
    const world = createStatusWorld({ content: loadVillageBakeryContent() });
    const chest = world.chest(55);
    world.stockFor(chest, "oven");
    const id = world.place("oven", 44);
    expect(evaluateSubject(world.engine, site(id))?.state).toBe(StatusState.Active);
    world.site(id).data.paused = true;
    getJobService(world.engine).setTierSource(() => "hamlet");
    expect(evaluateSubject(world.engine, site(id))?.reasons.map((reason) => reason.kind)).toEqual([
      BlockedReasonKind.Paused,
      BlockedReasonKind.LockedByTier,
    ]);
  });

  it("reports AwaitingWorker while its supply or build job waits on the board", () => {
    const world = createStatusWorld({ content: loadVillageBakeryContent() });
    world.spawn("peasant", 77, noAiOverride);
    const chest = world.chest(55);
    world.stockFor(chest, "wall");
    const id = world.place("wall", 44);
    world.run(6);
    const status = evaluateSubject(world.engine, site(id));
    expect(status?.state).toBe(StatusState.Blocked);
    expect(status?.reasons[0]?.kind).toBe(BlockedReasonKind.AwaitingWorker);
  });
});
