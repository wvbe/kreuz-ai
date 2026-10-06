// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ZoneStatus } from "../../../game/zones/zoneTypes";
import {
  buildBlockedBakery,
  firstEntityOf,
  renderPanel,
  startedHost,
} from "../testing/renderPanel";
import { ZoneInspection, ZoneInventory } from "./ZoneInspection";

afterEach(cleanup);

describe("ZoneInspection", () => {
  it("shows the type, status, requirement checklist and stored goods of a zone", () => {
    const host = startedHost("village");
    const { zone } = buildBlockedBakery(host);
    renderPanel(<ZoneInspection entityId={zone} />, host);
    expect(screen.getByRole("heading", { name: /Bakery zone/i })).toBeTruthy();
    expect(screen.getByText(/At least 4 tiles/)).toBeTruthy();
    expect(screen.getByText("Enclosed by walls and a door")).toBeTruthy();
    expect(screen.getByText(/Oak plank|Nothing stored|No storage/)).toBeTruthy();
  });

  // @covers 024:FR-020
  it("sums the stockpiles inside a zone", () => {
    const host = startedHost();
    const chest = firstEntityOf(host, "chest");
    const position = host.session.query.entity(chest)?.components["Position"] as {
      mapId: number;
      cellIndex: number;
    };
    renderPanel(
      <ZoneInventory
        zone={{
          id: 1,
          zoneTypeId: "stockpile",
          mapId: position.mapId,
          tiles: [position.cellIndex],
          isRoom: false,
          active: true,
          status: ZoneStatus.Active,
          gaps: [],
          filter: null,
          createdTick: 0,
          affinity: 0,
          workers: [],
        }}
      />,
      host,
    );
    expect(screen.getByText(/Oak plank x24/)).toBeTruthy();
  });

  it("says a deleted zone is gone", () => {
    const host = startedHost();
    renderPanel(<ZoneInspection entityId={99999} />, host);
    expect(screen.getByText("This zone is gone.")).toBeTruthy();
  });
});
