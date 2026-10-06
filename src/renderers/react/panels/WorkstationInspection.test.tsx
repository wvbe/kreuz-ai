// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildBlockedBakery, renderPanel, startedHost } from "../testing/renderPanel";
import { WorkstationInspection } from "./WorkstationInspection";

afterEach(cleanup);

describe("WorkstationInspection", () => {
  it("shows the open orders, the blocking reason and the recipes", () => {
    const host = startedHost("village");
    const { oven } = buildBlockedBakery(host);
    renderPanel(<WorkstationInspection entityId={oven} />, host);
    expect(screen.getByRole("heading", { name: "oven" })).toBeTruthy();
    expect(screen.getByText("Open orders")).toBeTruthy();
    expect(screen.getByText("Blocked by")).toBeTruthy();
    expect(screen.getAllByText(/Missing input: flour/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Bake bread/i)).toBeTruthy();
  });

  it("says a deleted workstation is gone", () => {
    const host = startedHost();
    renderPanel(<WorkstationInspection entityId={99999} />, host);
    expect(screen.getByText("This workstation is gone.")).toBeTruthy();
  });
});
