import { describe, expect, it } from "vitest";
import { ContentKind } from "../../../game/api/contentQueries";
import { EngineHost } from "../engine/EngineHost";
import { Screen } from "../navigation/Screen";
import { createFakeScheduler } from "../testing/fakeScheduler";
import { openContentEntry, takeContentRequest } from "./contentRequests";

describe("contentRequests", () => {
  it("remembers the entry, shows the content screen and hands the entry over once", () => {
    const host = new EngineHost({ scheduler: createFakeScheduler().scheduler });
    expect(takeContentRequest()).toBeNull();
    openContentEntry(host, ContentKind.Material, "bread");
    expect(host.navigation.getSnapshot().screen).toBe(Screen.Content);
    expect(takeContentRequest()).toEqual({ kind: ContentKind.Material, id: "bread" });
    expect(takeContentRequest()).toBeNull();
  });
});
