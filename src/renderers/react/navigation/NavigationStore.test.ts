import { describe, expect, it } from "vitest";
import { NavigationStore, screenFromHash } from "./NavigationStore";
import { Screen } from "./Screen";

describe("NavigationStore", () => {
  it("navigates and goes back", () => {
    const store = new NavigationStore();
    expect(store.getSnapshot()).toEqual({ screen: Screen.Map, previous: null });
    store.navigate(Screen.Flow);
    store.navigate(Screen.Settings);
    expect(store.getSnapshot()).toEqual({ screen: Screen.Settings, previous: Screen.Flow });
    store.back();
    expect(store.getSnapshot().screen).toBe(Screen.Flow);
  });

  it("returns to the map when there is nowhere to go back", () => {
    const store = new NavigationStore(Screen.NewGame);
    store.back();
    expect(store.getSnapshot().screen).toBe(Screen.Map);
  });

  it("ignores navigating to the screen already shown", () => {
    const store = new NavigationStore();
    const before = store.getSnapshot();
    store.navigate(Screen.Map);
    expect(store.getSnapshot()).toBe(before);
  });

  it("parses URL hashes", () => {
    expect(screenFromHash("#flow")).toBe(Screen.Flow);
    expect(screenFromHash("#/idle-blocked")).toBe(Screen.IdleBlocked);
    expect(screenFromHash("#nowhere")).toBeNull();
    expect(screenFromHash("")).toBeNull();
  });
});
