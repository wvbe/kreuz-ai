// @vitest-environment jsdom
import { act, cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { firstEntityOf, renderPanel, startedHost } from "../testing/renderPanel";
import { BuildSiteInspection } from "./BuildSiteInspection";

afterEach(cleanup);

describe("BuildSiteInspection", () => {
  it("shows the blueprint, progress and the materials delivered against required", () => {
    const host = startedHost();
    const placed = host.session.dispatch({
      kind: "PlaceFurniture",
      furnitureId: "table",
      mapId: 1,
      cell: 326,
    });
    expect(placed.ok).toBe(true);
    act(() => {
      host.step(2);
    });
    renderPanel(<BuildSiteInspection entityId={firstEntityOf(host, "build_site")} />, host);
    expect(screen.getByRole("heading", { name: /of table/ })).toBeTruthy();
    expect(screen.getByText("Materials delivered")).toBeTruthy();
    expect(screen.getByText("Progress")).toBeTruthy();
  });

  it("says a finished site is gone", () => {
    const host = startedHost();
    renderPanel(<BuildSiteInspection entityId={99999} />, host);
    expect(screen.getByText("This build site is gone.")).toBeTruthy();
  });
});
