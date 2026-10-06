// @vitest-environment jsdom
/* eslint-disable no-restricted-syntax -- tests read typed views out of query JSON */
import { act, cleanup, fireEvent, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { BoardChange } from "../../../game/crier/crierTypes";
import type { PendingUpdateView } from "../../../game/crier/crierViews";
import { renderApp } from "../testing/renderApp";
import type { PendingRouteView } from "../../../game/standing/standingViews";
import { describeChange, describeRoute, describeTiming } from "./PendingPanel";

afterEach(cleanup);

describe("describeChange", () => {
  it("tells the four change kinds apart", () => {
    const add = { jobTypeId: "fell.trees", cellIndex: 4, priority: null } as unknown as BoardChange;
    const remove = { postingId: 3 } as unknown as BoardChange;
    const modify = { postingId: 3, priority: 80, wage: null } as unknown as BoardChange;
    const run = { runId: 9 } as unknown as BoardChange;
    expect(describeChange(add)).toBe("post fell.trees at cell 4");
    expect(describeChange(remove)).toBe("remove posting #3");
    expect(describeChange(modify)).toBe("change posting #3");
    expect(describeChange(run)).toBe("standing-order run #9");
  });
});

describe("describeTiming", () => {
  // @covers 024:FR-011
  it("shows the crier's ETA and progress, or what the update waits for", () => {
    const carried = { crierId: 7, etaTicks: 12, progressPermille: 450 } as PendingUpdateView;
    expect(describeTiming(carried)).toBe("crier #7, ETA 12 ticks, 45% of the way");
    const waiting = {
      crierId: null,
      waitingFor: "NoTownCrier",
      state: "Waiting",
    } as unknown as PendingUpdateView;
    expect(describeTiming(waiting)).toBe("waiting: NoTownCrier");
  });
});

describe("describeRoute", () => {
  // @covers 024:FR-032
  it("names the Notice Post and the next bell ring, or nothing for a plain board", () => {
    const both = {
      updateId: 1,
      boardId: 2,
      noticePostId: 9,
      bellTowerZoneId: 4,
      nextBellRingTick: 3600,
    } as PendingRouteView;
    expect(describeRoute(both)).toBe("also by: Notice Post #9 or next bell ring at tick 3600");
    expect(
      describeRoute({ ...both, noticePostId: null, bellTowerZoneId: null, nextBellRingTick: null }),
    ).toBe("");
    expect(describeRoute(undefined)).toBe("");
  });
});

describe("PendingPanel as a side panel", () => {
  // @covers 024:FR-011 024:FR-012
  it("lists a queued posting beside the map and cancels it", () => {
    const app = renderApp();
    app.start();
    const panel = document.querySelector('[data-panel="pending-commands"]') as HTMLElement;
    expect(within(panel).getByText("No commands are waiting for a Town Crier.")).toBeTruthy();
    act(() => {
      app.host.commands.send({
        kind: "PostJob",
        boardId: 2,
        jobTypeId: "fell.trees",
        mapId: 1,
        cellIndex: 296,
      });
      app.host.step(1);
    });
    expect(within(panel).getByText(/post fell.trees at cell 296/)).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Cancel" }));
    act(() => {
      app.host.step(1);
    });
    expect(within(panel).getByText("No commands are waiting for a Town Crier.")).toBeTruthy();
  });
});
/* eslint-enable no-restricted-syntax -- end of the test file */
