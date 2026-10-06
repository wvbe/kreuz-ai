// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Screen } from "../navigation/Screen";
import { clickCell, dragOverCells, hoverCell } from "../testing/mapGestures";
import { renderApp } from "../testing/renderApp";
import { sidePanels } from "./sidePanels";

afterEach(cleanup);

describe("SelectionDock", () => {
  it("renders every registered side panel beside the map", () => {
    const app = renderApp();
    app.start();
    const dock = screen.getByRole("complementary", { name: "Panels" });
    for (const panel of sidePanels) {
      expect(dock.querySelector(`[data-panel="${panel.id}"]`)).not.toBeNull();
    }
    expect(screen.getByText("Nothing selected.")).toBeTruthy();
  });

  // @covers 024:SC-004 024:FR-013 024:FR-015 024:FR-031
  it("places furniture, draws a zone and appoints a Steward without leaving the map", () => {
    const app = renderApp();
    app.start();
    const build = document.querySelector('[data-panel="build-menu"]') as HTMLElement;
    fireEvent.click(within(build).getByRole("button", { name: "Oven" }));
    hoverCell(app, 300);
    clickCell(app, 300);
    const zones = document.querySelector('[data-panel="zones"]') as HTMLElement;
    fireEvent.click(within(zones).getByRole("button", { name: "Stockpile" }));
    dragOverCells(app, [257, 258]);
    const farmer = app.host.session.query.entities({ prototype: "farmer", limit: 1 }).entities[0];
    act(() => {
      app.host.selection.selectEntity(farmer?.id ?? 0, null);
    });
    fireEvent.click(screen.getByRole("button", { name: "Appoint as Steward" }));
    act(() => {
      app.host.step(1);
    });
    expect(app.host.navigation.getSnapshot().screen).toBe(Screen.Map);
    const queue = app.host.store.query("construction-queue", {});
    expect(queue.ok && JSON.stringify(queue.data)).toContain("oven");
    const zoneList = app.host.store.query("zones", { mapId: 1 });
    expect(zoneList.ok && JSON.stringify(zoneList.data)).toContain("stockpile");
    const steward = app.host.store.query("steward", {});
    // eslint-disable-next-line no-restricted-syntax -- the test reads the documented view out of the query JSON
    const office = steward.ok ? (steward.data as unknown as { stewardEntityId: number }) : null;
    expect(office?.stewardEntityId).toBe(farmer?.id);
  });
});
