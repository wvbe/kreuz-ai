// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { EntityDetailView } from "../../../game/api/Views";
import { firstEntityOf, renderPanel, startedHost } from "../testing/renderPanel";
import type { EngineHost } from "../engine/EngineHost";
import { InventoryTab } from "./InventoryTab";

afterEach(cleanup);

function detailOf(host: EngineHost, prototype: string): EntityDetailView {
  const detail = host.session.query.entity(firstEntityOf(host, prototype));
  if (detail === null) {
    throw new Error(`no ${prototype}`);
  }
  return detail;
}

describe("InventoryTab", () => {
  // @covers 024:FR-020
  it("lists the stacks of a citizen with slots used", () => {
    const host = startedHost();
    renderPanel(<InventoryTab detail={detailOf(host, "peasant")} />, host);
    expect(screen.getByText(/Bread x2/)).toBeTruthy();
    expect(screen.getByText(/Slots 1 of 8/)).toBeTruthy();
  });

  it("says so for an entity without an inventory", () => {
    const host = startedHost();
    renderPanel(<InventoryTab detail={detailOf(host, "job_board")} />, host);
    expect(screen.getByText("This has no inventory.")).toBeTruthy();
  });
});
