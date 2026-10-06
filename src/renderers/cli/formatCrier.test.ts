import { describe, expect, it } from "vitest";
import { formatCriers, formatPendingUpdates } from "./formatCrier";

const carried = {
  updateId: 1,
  boardId: 2,
  state: "carried",
  crierId: 7,
  etaTicks: 12,
  progressPermille: 450,
  waitingFor: null,
  changes: [{ kind: "add", jobTypeId: "fell.trees", cellIndex: 15 }],
};

describe("formatPendingUpdates", () => {
  it("prints a carried update with crier, ETA and progress", () => {
    expect(formatPendingUpdates([carried])).toEqual([
      "update #1 for board #2: post fell.trees at cell 15; carried by #7, eta 12 ticks, 45% of the way",
    ]);
  });

  it("prints why a queued update waits and describes every change kind", () => {
    expect(
      formatPendingUpdates([
        {
          ...carried,
          crierId: null,
          etaTicks: null,
          waitingFor: "NoTownCrier",
          changes: [
            { kind: "remove", postingId: 4 },
            { kind: "modify", postingId: 5 },
          ],
        },
      ]),
    ).toEqual([
      "update #1 for board #2: remove posting #4, change posting #5; waiting for a crier (NoTownCrier)",
    ]);
  });

  it("says so when nothing is pending or the data is foreign", () => {
    expect(formatPendingUpdates([])).toEqual(["no pending board updates"]);
    expect(formatPendingUpdates("x")).toEqual(["no pending board updates"]);
  });
});

describe("formatCriers", () => {
  it("prints each crier with its place and load", () => {
    expect(
      formatCriers([
        { crierId: 7, status: "available", mapId: 1, cellIndex: 9, boardQueue: [], carrying: [] },
        {
          crierId: 8,
          status: "traveling",
          mapId: 1,
          cellIndex: 3,
          boardQueue: [2],
          carrying: [1, 2],
        },
      ]),
    ).toEqual([
      "crier #7 available at map 1 cell 9",
      "crier #8 traveling at map 1 cell 3, carrying #1 #2 to board #2",
    ]);
  });

  it("says so when the colony has no crier", () => {
    expect(formatCriers([])).toEqual(["no Town Criers (crier appoint <entityId>)"]);
  });
});
