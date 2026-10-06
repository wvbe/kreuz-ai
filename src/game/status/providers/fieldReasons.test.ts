import { describe, expect, it } from "vitest";
import { postSowJobs } from "../../gathering/cropJobs";
import { postFishJobs } from "../../gathering/fishJobs";
import { evaluateSubject } from "../explain";
import { BlockedReasonKind, StatusState, StatusSubjectKind } from "../statusTypes";
import { createStatusWorld } from "../testStatusWorld";
import type { StatusTestWorld } from "../testStatusWorld";
import { fieldReasons } from "./fieldReasons";

function fieldWorld(fertile: boolean): { world: StatusTestWorld; zoneId: number } {
  const world = createStatusWorld();
  const cells = world.rect(2, 2, 2, 2);
  if (fertile) {
    for (const cell of cells) {
      world.engine.maps.require(world.mapId).setTerrain(cell, "fertile_soil");
    }
  }
  const [zoneId] = world.designate("farm_field", cells);
  world.run(2);
  return { world, zoneId: zoneId ?? 0 };
}

describe("fieldReasons", () => {
  it("has no reasons for other zone types and for a field with nothing to do", () => {
    const { world, zoneId } = fieldWorld(true);
    expect(fieldReasons(world.engine, zoneId)).toEqual([]);
    const [stock] = world.designate("stockpile", world.rect(6, 6, 2, 2));
    expect(fieldReasons(world.engine, stock ?? 0)).toEqual([]);
    expect(fieldReasons(world.engine, 9999)).toEqual([]);
  });

  it("explains a field nobody works: AwaitingWorker with the sow posting as cause", () => {
    const { world, zoneId } = fieldWorld(true);
    const [postingId] = postSowJobs(world.engine, 12);
    const reasons = fieldReasons(world.engine, zoneId);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]?.kind).toBe(BlockedReasonKind.AwaitingWorker);
    expect(reasons[0]?.params["postingId"]).toBe(postingId);
    expect(reasons[0]?.causeRef).toEqual({ kind: StatusSubjectKind.JobPosting, id: postingId });
    const status = evaluateSubject(world.engine, { kind: StatusSubjectKind.Zone, id: zoneId });
    expect(status?.state).toBe(StatusState.Blocked);
    expect(status?.reasons[0]?.kind).toBe(BlockedReasonKind.AwaitingWorker);
  });

  it("explains a field without fertile soil: LocationBlocked", () => {
    const { world, zoneId } = fieldWorld(false);
    const reasons = fieldReasons(world.engine, zoneId);
    expect(reasons[0]?.kind).toBe(BlockedReasonKind.LocationBlocked);
    expect(reasons[0]?.params["zoneTypeId"]).toBe("farm_field");
    const status = evaluateSubject(world.engine, { kind: StatusSubjectKind.Zone, id: zoneId });
    expect(status?.state).toBe(StatusState.Blocked);
  });

  it("explains a flax field like a wheat field and a herb garden by its harvest job", () => {
    const world = createStatusWorld();
    const cells = world.rect(2, 2, 2, 2);
    for (const cell of cells) {
      world.engine.maps.require(world.mapId).setTerrain(cell, "fertile_soil");
    }
    const [flaxId] = world.designate("flax_field", cells);
    world.run(2);
    const [postingId] = postSowJobs(world.engine, 12);
    expect(fieldReasons(world.engine, flaxId ?? 0)[0]?.params["postingId"]).toBe(postingId);
    const bare = createStatusWorld();
    const [gardenId] = bare.designate("herb_garden", bare.rect(2, 2, 3, 2));
    bare.run(2);
    expect(fieldReasons(bare.engine, gardenId ?? 0)[0]?.kind).toBe(
      BlockedReasonKind.LocationBlocked,
    );
  });

  it("explains a fishing dock: LocationBlocked without water, AwaitingWorker with a posting", () => {
    const dry = createStatusWorld();
    const [dockId] = dry.designate("fishing_dock", [50, 51, 52, 53]);
    dry.run(2);
    expect(fieldReasons(dry.engine, dockId ?? 0)[0]?.kind).toBe(BlockedReasonKind.LocationBlocked);
    const wet = createStatusWorld();
    wet.engine.maps.require(wet.mapId).setTerrain(60, "water_shallow");
    const [wetId] = wet.designate("fishing_dock", [50, 51, 52, 53]);
    wet.run(2);
    const [postingId] = postFishJobs(wet.engine, 12);
    expect(postingId).toBeDefined();
    const reasons = fieldReasons(wet.engine, wetId ?? 0);
    expect(reasons[0]?.kind).toBe(BlockedReasonKind.AwaitingWorker);
    expect(reasons[0]?.params["postingId"]).toBe(postingId);
  });
});
