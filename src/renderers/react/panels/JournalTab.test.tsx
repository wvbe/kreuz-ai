// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { firstEntityOf, renderPanel, startedHost } from "../testing/renderPanel";
import { JournalTab, journalLinesShown } from "./JournalTab";

afterEach(cleanup);

describe("JournalTab", () => {
  // @covers 024:FR-039 028:FR-022
  it("shows the newest lines and opens the chronicle", () => {
    const host = startedHost();
    renderPanel(<JournalTab entityId={firstEntityOf(host, "peasant")} />, host);
    expect(screen.getByText(/has come to the hamlet/)).toBeTruthy();
    expect(journalLinesShown).toBeGreaterThan(2);
    fireEvent.click(screen.getByRole("button", { name: "Open the chronicle" }));
    expect(host.navigation.getSnapshot().screen).toBe("chronicle");
  });
});
