// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { firstEntityOf, renderPanel, startedHost } from "../testing/renderPanel";
import { TileInspection } from "./TileInspection";

afterEach(cleanup);

describe("TileInspection", () => {
  it("shows terrain, move cost, buildable and occupants, and selects an occupant", () => {
    const host = startedHost();
    const chest = firstEntityOf(host, "chest");
    const position = host.session.query.entity(chest)?.components["Position"] as {
      mapId: number;
      cellIndex: number;
    };
    renderPanel(<TileInspection mapId={position.mapId} cell={position.cellIndex} />, host);
    expect(screen.getByText("Move cost")).toBeTruthy();
    expect(screen.getByText("Buildable")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /chest/ }));
    expect(host.selection.getSnapshot().entityId).toBe(chest);
  });

  it("says a blocked tile is blocked", () => {
    const host = startedHost();
    renderPanel(<TileInspection mapId={1} cell={5} />, host);
    expect(screen.getByText(/blocked \(impassable cliff\)/)).toBeTruthy();
  });

  it("shows the zone a tile belongs to", () => {
    const host = startedHost("village");
    const designated = host.session.dispatch({
      kind: "DesignateZone",
      zoneTypeId: "stockpile",
      mapId: 1,
      cells: [326],
    });
    expect(designated.ok).toBe(true);
    act(() => {
      host.step(2);
    });
    renderPanel(<TileInspection mapId={1} cell={326} />, host);
    expect(screen.getByRole("button", { name: /stockpile #/ })).toBeTruthy();
  });
});
