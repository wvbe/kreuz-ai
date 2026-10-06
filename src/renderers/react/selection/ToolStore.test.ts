import { describe, expect, it } from "vitest";
import { ToolMode, ToolStore } from "./ToolStore";

describe("ToolStore", () => {
  it("starts in inspect mode, enters placement and cancels", () => {
    const store = new ToolStore();
    expect(store.getSnapshot()).toEqual({ mode: ToolMode.Inspect, prototypeId: null });
    store.enterPlacement("chest");
    expect(store.getSnapshot()).toEqual({ mode: ToolMode.Place, prototypeId: "chest" });
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
