import { describe, expect, it } from "vitest";
import { SelectionStore } from "./SelectionStore";

describe("SelectionStore", () => {
  it("selects an entity with its cell and clears", () => {
    const store = new SelectionStore();
    store.selectEntity(7, 12);
    expect(store.getSnapshot()).toMatchObject({ entityId: 7, cell: 12 });
    store.clear();
    expect(store.getSnapshot()).toMatchObject({ entityId: null, cell: null });
  });

  it("selecting a cell drops the entity", () => {
    const store = new SelectionStore();
    store.selectEntity(7, 12);
    store.selectCell(13);
    expect(store.getSnapshot()).toMatchObject({ entityId: null, cell: 13 });
  });

  it("changing the active map drops the selection but not for the same map", () => {
    const store = new SelectionStore();
    store.setActiveMap(1);
    store.selectCell(4);
    const before = store.getSnapshot();
    store.setActiveMap(1);
    expect(store.getSnapshot()).toBe(before);
    store.setActiveMap(2);
    expect(store.getSnapshot()).toMatchObject({ activeMapId: 2, cell: null });
  });

  it("does not notify when the hover is unchanged", () => {
    const store = new SelectionStore();
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    store.setHover(3, null);
    store.setHover(3, null);
    expect(calls).toBe(1);
  });

  it("numbers focus requests and switches the map", () => {
    const store = new SelectionStore();
    store.requestFocus(2, 5);
    store.requestFocus(2, 5);
    expect(store.getSnapshot().focus).toEqual({ mapId: 2, cell: 5, nonce: 2 });
    expect(store.getSnapshot().activeMapId).toBe(2);
    store.reset();
    expect(store.getSnapshot().focus).toBeNull();
  });
});
