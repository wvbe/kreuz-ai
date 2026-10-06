// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { firstEntityOf, renderPanel, startedHost } from "../testing/renderPanel";
import { CitizenOverview } from "./CitizenOverview";

afterEach(cleanup);

describe("CitizenOverview", () => {
  it("shows the action, need bars with values, skills, traits and factions", () => {
    const host = startedHost();
    renderPanel(<CitizenOverview entityId={firstEntityOf(host, "peasant")} />, host);
    expect(screen.getByText("Doing")).toBeTruthy();
    expect(screen.getByRole("meter", { name: "Rest" }).getAttribute("aria-valuenow")).toBe("80");
    expect(screen.getByRole("meter", { name: "Mood" })).toBeTruthy();
    expect(screen.getByText(/Farming 5/)).toBeTruthy();
    expect(screen.getByText(/Strong/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Settlement" }));
    expect(host.selection.getSnapshot().entityId).not.toBeNull();
  });
});
