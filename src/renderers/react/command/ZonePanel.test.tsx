// @vitest-environment jsdom
/* eslint-disable no-restricted-syntax, @typescript-eslint/naming-convention -- tests read typed views out of query JSON and spawn prototypes with component-name overrides */
import { act, cleanup, fireEvent, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ZoneView } from "../../../game/zones/zoneTypes";
import { PaintAction, ToolMode } from "../selection/ToolStore";
import { clickCell, dragOverCells } from "../testing/mapGestures";
import { renderApp } from "../testing/renderApp";
import type { RenderedApp } from "../testing/renderApp";
import { splitIds } from "./ZonePanel";

afterEach(cleanup);

function zones(app: RenderedApp): readonly ZoneView[] {
  const result = app.host.store.query("zones", { mapId: 1 });
  return result.ok ? (result.data as unknown as readonly ZoneView[]) : [];
}

function panel(): HTMLElement {
  return document.querySelector('[data-panel="zones"]') as HTMLElement;
}

function step(app: RenderedApp): void {
  act(() => {
    app.host.step(1);
  });
}

describe("splitIds", () => {
  it("trims and drops empty ids", () => {
    expect(splitIds(" bread, ,flour ,")).toEqual(["bread", "flour"]);
    expect(splitIds("")).toEqual([]);
  });
});

describe("ZonePanel", () => {
  it("greys locked zone types with their tier and refuses to paint them", () => {
    const app = renderApp();
    app.start();
    const warehouse = within(panel()).getByRole("button", { name: "Warehouse" });
    expect((warehouse as HTMLButtonElement).disabled).toBe(true);
    expect(within(panel()).getAllByText("Unlocks at Village").length).toBeGreaterThan(0);
    fireEvent.click(warehouse);
    expect(app.host.tools.getSnapshot().mode).toBe(ToolMode.Inspect);
  });

  it("designates a zone by painting cells with a zone type chosen in the picker", () => {
    const app = renderApp();
    app.start();
    fireEvent.click(within(panel()).getByRole("button", { name: "Stockpile" }));
    expect(app.host.tools.getSnapshot()).toMatchObject({
      mode: ToolMode.Paint,
      paintAction: PaintAction.Designate,
      zoneTypeId: "stockpile",
    });
    dragOverCells(app, [257, 258]);
    step(app);
    const [zone] = zones(app);
    expect(zone?.zoneTypeId).toBe("stockpile");
    expect([...(zone?.tiles ?? [])].sort()).toEqual([257, 258]);
    expect(within(panel()).getByText(/#\d+ stockpile/)).toBeTruthy();
  });

  it("adds and removes tiles of the selected zone, sets its filter and deletes it", () => {
    const app = renderApp();
    app.start();
    act(() => {
      app.host.commands.send({
        kind: "DesignateZone",
        zoneTypeId: "stockpile",
        mapId: 1,
        cells: [257],
      });
    });
    step(app);
    const zoneId = zones(app)[0]?.id ?? 0;
    expect(zoneId).toBeGreaterThan(0);

    // Selecting the zone's cell shows its tools.
    app.host.tools.cancel();
    clickCell(app, 257);
    fireEvent.click(within(panel()).getByRole("button", { name: "Add tiles" }));
    expect(app.host.tools.getSnapshot()).toMatchObject({
      paintAction: PaintAction.AddTiles,
      zoneId,
    });
    dragOverCells(app, [258, 256]);
    step(app);
    expect([...(zones(app)[0]?.tiles ?? [])].sort()).toEqual([256, 257, 258]);

    fireEvent.click(within(panel()).getByRole("button", { name: "Done" }));
    clickCell(app, 257);
    fireEvent.click(within(panel()).getByRole("button", { name: "Remove tiles" }));
    dragOverCells(app, [256]);
    step(app);
    expect([...(zones(app)[0]?.tiles ?? [])].sort()).toEqual([257, 258]);

    fireEvent.click(within(panel()).getByRole("button", { name: "Done" }));
    fireEvent.change(within(panel()).getByLabelText("Accepted materials"), {
      target: { value: "wheat, flour" },
    });
    fireEvent.click(within(panel()).getByRole("button", { name: "Set filter" }));
    step(app);
    expect(zones(app)[0]?.filter).toEqual({ categories: [], materialIds: ["flour", "wheat"] });
    fireEvent.click(within(panel()).getByRole("button", { name: "Clear filter" }));
    step(app);
    expect(zones(app)[0]?.filter).toBeNull();

    fireEvent.click(within(panel()).getByRole("button", { name: "Delete zone" }));
    step(app);
    expect(zones(app)).toHaveLength(0);
  });

  it("shows the structured error of a refused filter beside the form", () => {
    const app = renderApp();
    app.start();
    act(() => {
      app.host.commands.send({
        kind: "DesignateZone",
        zoneTypeId: "stockpile",
        mapId: 1,
        cells: [257],
      });
    });
    step(app);
    clickCell(app, 257);
    fireEvent.change(within(panel()).getByLabelText("Accepted materials"), {
      target: { value: "no_such_material" },
    });
    fireEvent.click(within(panel()).getByRole("button", { name: "Set filter" }));
    step(app);
    expect(zones(app)[0]?.filter).toBeNull();
    expect(app.host.toasts.getSnapshot().toasts.length).toBeGreaterThan(0);
  });

  it("offers to merge two zones a removed wall joined and sends the answer", () => {
    const app = renderApp();
    app.start();
    const wall = app.host.session.engine.store.spawn("wall", {
      Position: { mapId: 1, cellIndex: 258 },
    });
    act(() => {
      app.host.commands.send({
        kind: "DesignateZone",
        zoneTypeId: "stockpile",
        mapId: 1,
        cells: [257],
      });
      app.host.commands.send({
        kind: "DesignateZone",
        zoneTypeId: "stockpile",
        mapId: 1,
        cells: [259],
      });
    });
    app.host.step(2);
    expect(within(panel()).queryByText("Merge offers")).toBeNull();
    app.host.session.engine.store.requestDelete(wall.id);
    act(() => {
      app.host.step(2);
    });
    const section = within(panel()).getByRole("region", { name: "Merge offers" });
    fireEvent.click(within(section).getByRole("button", { name: "Merge" }));
    step(app);
    expect(zones(app)).toHaveLength(1);
    expect(zones(app)[0]?.tiles).toEqual(expect.arrayContaining([257, 259]));
    expect(within(panel()).queryByText("Merge offers")).toBeNull();
  });
});
/* eslint-enable no-restricted-syntax, @typescript-eslint/naming-convention -- end of the test file */
