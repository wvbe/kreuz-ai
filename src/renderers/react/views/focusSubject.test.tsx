// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Screen } from "../navigation/Screen";
import { renderApp } from "../testing/renderApp";
import { focusEntity, focusLocation, focusSubject, locateSubject } from "./focusSubject";

describe("focusSubject", () => {
  // @covers 024:FR-026
  it("selects a citizen and asks the camera to move; unknown things do nothing", () => {
    const app = renderApp();
    app.start();
    expect(locateSubject(app.host, { kind: "Citizen", id: 3 })).not.toBeNull();
    expect(focusSubject(app.host, { kind: "Citizen", id: 3 })).toBe(true);
    expect(app.host.selection.getSnapshot().entityId).toBe(3);
    expect(app.host.selection.getSnapshot().focus).not.toBeNull();
    expect(app.host.navigation.getSnapshot().screen).toBe(Screen.Map);
    expect(focusEntity(app.host, 999_999)).toBe(false);
    expect(focusSubject(app.host, { kind: "JobPosting", id: 999_999 }, [])).toBe(false);
    expect(locateSubject(app.host, { kind: "Zone", id: 999_999 })).toBeNull();
  });

  it("finds the place a posting's or order's reasons point at", () => {
    const app = renderApp();
    app.start();
    const viaParam = locateSubject(app.host, { kind: "JobPosting", id: 77 }, [
      { kind: "AwaitingWorker", params: { boardId: 2 }, causeRef: null },
    ]);
    expect(viaParam).not.toBeNull();
    const viaCause = locateSubject(app.host, { kind: "ProductionOrder", id: 1 }, [
      { kind: "MissingInput", params: {}, causeRef: { kind: "Citizen", id: 3 } },
    ]);
    expect(viaCause?.entityId).toBe(3);
  });

  it("selects a bare cell for a location without an entity", () => {
    const app = renderApp();
    app.start();
    focusLocation(app.host, { mapId: 1, cell: 5, entityId: null });
    expect(app.host.selection.getSnapshot()).toMatchObject({ entityId: null, cell: 5 });
    expect(app.host.selection.getSnapshot().focus).toMatchObject({ mapId: 1, cell: 5 });
  });
});
