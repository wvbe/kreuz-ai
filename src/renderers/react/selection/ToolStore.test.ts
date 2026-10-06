import { describe, expect, it } from "vitest";
import { PaintAction, ToolMode, ToolStore } from "./ToolStore";

describe("ToolStore", () => {
  it("starts in inspect mode, enters placement and cancels", () => {
    const store = new ToolStore();
    expect(store.getSnapshot()).toMatchObject({ mode: ToolMode.Inspect, prototypeId: null });
    store.enterPlacement("chest");
    expect(store.getSnapshot()).toMatchObject({ mode: ToolMode.Place, prototypeId: "chest" });
    store.cancel();
    expect(store.getSnapshot().mode).toBe(ToolMode.Inspect);
  });

  it("enters paint and wall modes with their targets and leaves nothing of the old tool behind", () => {
    const store = new ToolStore();
    store.enterPlacement("chest");
    store.enterPaint(PaintAction.Designate, { zoneTypeId: "stockpile" });
    expect(store.getSnapshot()).toEqual({
      mode: ToolMode.Paint,
      prototypeId: null,
      paintAction: PaintAction.Designate,
      zoneTypeId: "stockpile",
      zoneId: null,
    });
    store.enterPaint(PaintAction.AddTiles, { zoneId: 4 });
    expect(store.getSnapshot()).toMatchObject({ zoneTypeId: null, zoneId: 4 });
    store.enterWalls();
    expect(store.getSnapshot()).toMatchObject({ mode: ToolMode.Walls, prototypeId: "wall" });
    store.cancel();
    expect(store.getSnapshot().mode).toBe(ToolMode.Inspect);
  });

  it("does not notify when cancelling in inspect mode", () => {
    const store = new ToolStore();
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    store.cancel();
    expect(calls).toBe(0);
  });
});
