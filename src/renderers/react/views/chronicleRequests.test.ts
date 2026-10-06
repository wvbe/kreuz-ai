import { describe, expect, it } from "vitest";
import { EngineHost } from "../engine/EngineHost";
import { Screen } from "../navigation/Screen";
import {
  ChronicleRequestStore,
  chronicleRequests,
  openChronicle,
  openCitizenJournal,
} from "./chronicleRequests";

describe("chronicleRequests", () => {
  it("starts without a filter and replaces or clears it", () => {
    const store = new ChronicleRequestStore();
    expect(store.getSnapshot()).toEqual({ entityId: null, kind: null, journal: false });
    store.set({ entityId: 4, kind: "died", journal: false });
    expect(store.getSnapshot().kind).toBe("died");
    store.clear();
    expect(store.getSnapshot().entityId).toBeNull();
  });

  it("opens the chronicle unfiltered or a citizen's journal", () => {
    const host = new EngineHost();
    openCitizenJournal(host, 3);
    expect(host.navigation.getSnapshot().screen).toBe(Screen.Chronicle);
    expect(chronicleRequests.getSnapshot()).toEqual({ entityId: 3, kind: null, journal: true });
    openChronicle(host);
    expect(chronicleRequests.getSnapshot().entityId).toBeNull();
    chronicleRequests.clear();
  });
});
