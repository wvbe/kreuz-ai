import { describe, expect, it } from "vitest";
import { createStatusContext } from "../statusContext";
import { evaluateSubject, explain } from "../explain";
import { BlockedReasonKind, StatusState, StatusSubjectKind } from "../statusTypes";
import { createStatusWorld } from "../testStatusWorld";
import { loosePileProvider } from "./loosePileProvider";

const pileRef = (id: number) => ({ kind: StatusSubjectKind.LoosePile, id });

describe("loosePileProvider", () => {
  it("lists piles that hold goods and returns null for other entities", () => {
    const world = createStatusWorld();
    const pile = world.pile(44, [{ materialId: "oak_log", quantity: 3 }]);
    world.pile(45, []);
    const chest = world.chest(55);
    expect(loosePileProvider.subjects(world.engine)).toEqual([pileRef(pile.id)]);
    expect(
      loosePileProvider.evaluate(
        world.engine,
        pileRef(chest.id),
        createStatusContext(world.engine),
      ),
    ).toBeNull();
  });

  it("is Blocked with NoStorageDestination for a material no storage accepts", () => {
    const world = createStatusWorld();
    const pile = world.pile(44, [{ materialId: "oak_log", quantity: 3 }]);
    const status = evaluateSubject(world.engine, pileRef(pile.id));
    expect(status?.state).toBe(StatusState.Blocked);
    expect(status?.reasons).toEqual([
      {
        kind: BlockedReasonKind.NoStorageDestination,
        params: { materialId: "oak_log" },
        causeRef: null,
      },
    ]);
  });

  it("is Active while a destination exists and nothing is posted yet", () => {
    const world = createStatusWorld();
    world.chest(55);
    const pile = world.pile(44, [{ materialId: "oak_log", quantity: 3 }]);
    expect(evaluateSubject(world.engine, pileRef(pile.id))?.state).toBe(StatusState.Active);
  });

  it("reports AwaitingWorker with the haul posting as cause once it is posted", () => {
    const world = createStatusWorld();
    world.chest(55);
    world.spawn("peasant", 77, { AiState: { treeId: null } });
    const pile = world.pile(44, [{ materialId: "oak_log", quantity: 3 }]);
    world.run(24);
    const explanation = explain(world.engine, pileRef(pile.id));
    expect(explanation?.state).toBe(StatusState.Blocked);
    expect(explanation?.reasons[0]?.kind).toBe(BlockedReasonKind.AwaitingWorker);
    expect(explanation?.chain[1]?.subject.kind).toBe(StatusSubjectKind.JobPosting);
  });
});
