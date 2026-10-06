// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { firstEntityOf, renderPanel, startedHost } from "../testing/renderPanel";
import { CitizenOverview } from "./CitizenOverview";

afterEach(cleanup);

describe("CitizenOverview", () => {
  // @covers 024:FR-007
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

  // @covers 024:FR-007 024:SC-003
  it("shows the behavior tree, the zone and live values that follow the clock", () => {
    const host = startedHost();
    const id = firstEntityOf(host, "peasant");
    renderPanel(<CitizenOverview entityId={id} />, host);
    expect(screen.getByText("Behavior")).toBeTruthy();
    expect(screen.getByText("Zone")).toBeTruthy();
    const before = screen.getByRole("meter", { name: "Rest" }).getAttribute("aria-valuenow");
    act(() => {
      host.step(300);
    });
    // the panel was not re-selected: the need bar moved with the simulation
    expect(screen.getByRole("meter", { name: "Rest" }).getAttribute("aria-valuenow")).not.toBe(
      before,
    );
  });

  // @covers 024:FR-031 024:FR-038
  it("appoints the citizen as Steward, shows the office and offers Dismiss", () => {
    const host = startedHost();
    const id = firstEntityOf(host, "farmer");
    renderPanel(<CitizenOverview entityId={id} />, host);
    fireEvent.click(screen.getByRole("button", { name: "Appoint as Steward" }));
    act(() => {
      host.step(1);
    });
    expect(screen.getByText("Steward of the settlement")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    act(() => {
      host.step(1);
    });
    expect(screen.getByRole("button", { name: "Appoint as Steward" })).toBeTruthy();
    expect(screen.queryByText("Steward of the settlement")).toBeNull();
  });
});
