// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildBlockedBakery,
  firstEntityOf,
  renderPanel,
  startedHost,
} from "../testing/renderPanel";
import { PrimaryStatus } from "./PrimaryStatus";

afterEach(cleanup);

describe("PrimaryStatus", () => {
  // @covers 025:FR-016 025:SC-006
  it("starts with the state and primary reason of a blocked workstation, with a why button", () => {
    const host = startedHost("village");
    const { oven } = buildBlockedBakery(host);
    renderPanel(<PrimaryStatus id={oven} />, host);
    expect(screen.getByText("Blocked")).toBeTruthy();
    expect(screen.getByText(/Missing input: flour/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "why?" })).toBeTruthy();
  });

  it("shows the state of a citizen or a quiet note for something without a status", () => {
    const host = startedHost();
    renderPanel(
      <div>
        <PrimaryStatus id={firstEntityOf(host, "peasant")} />
        <PrimaryStatus id={firstEntityOf(host, "chest")} />
      </div>,
      host,
    );
    expect(screen.getByText("Idle")).toBeTruthy();
    expect(screen.getByText("No status to report.")).toBeTruthy();
  });
});
