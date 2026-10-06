// @vitest-environment jsdom
/* eslint-disable no-restricted-syntax -- tests read typed views out of query JSON */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { cellsInRect } from "./strokeMath";
import { ToolMode } from "../selection/ToolStore";
import { clickCell, dragOverCells, hoverCell } from "../testing/mapGestures";
import { renderApp } from "../testing/renderApp";

afterEach(cleanup);

type Queue = { jobs: { prototypeId: string; cellIndex: number; kind: string }[] };

function queue(app: ReturnType<typeof renderApp>): Queue {
  const result = app.host.store.query("construction-queue", {});
  if (!result.ok) {
    throw new Error("no construction queue");
  }
  return result.data as unknown as Queue;
}

describe("BuildMenuPanel", () => {
  it("groups the menu by category and greys locked entries with their tier", () => {
    const app = renderApp();
    app.start();
    const panel = document.querySelector('[data-panel="build-menu"]') as HTMLElement;
    expect(within(panel).getByRole("region", { name: "Workstations" })).toBeTruthy();
    expect(within(panel).getByRole("region", { name: "Storage" })).toBeTruthy();
    const forge = within(panel).getByRole("button", { name: "Forge" });
    expect((forge as HTMLButtonElement).disabled).toBe(true);
    expect(within(panel).getAllByText("Unlocks at Village").length).toBeGreaterThan(0);
    fireEvent.click(forge);
    expect(app.host.tools.getSnapshot().mode).toBe(ToolMode.Inspect);
  });

  it("filters by the search text", () => {
    const app = renderApp();
    app.start();
    const panel = document.querySelector('[data-panel="build-menu"]') as HTMLElement;
    fireEvent.change(within(panel).getByLabelText("Search the build menu"), {
      target: { value: "oven" },
    });
    expect(within(panel).getByRole("button", { name: "Oven" })).toBeTruthy();
    expect(within(panel).queryByRole("button", { name: "Chest" })).toBeNull();
    fireEvent.change(within(panel).getByLabelText("Search the build menu"), {
      target: { value: "zzz" },
    });
    expect(within(panel).getByText("Nothing matches.")).toBeTruthy();
  });

  it("places an oven with a click on a valid cell and the construction queue gets a site", () => {
    const app = renderApp();
    app.start();
    const panel = document.querySelector('[data-panel="build-menu"]') as HTMLElement;
    fireEvent.click(within(panel).getByRole("button", { name: "Oven" }));
    expect(app.host.tools.getSnapshot()).toMatchObject({
      mode: ToolMode.Place,
      prototypeId: "oven",
    });
    hoverCell(app, 300);
    expect(within(panel).getByText("This cell is valid.")).toBeTruthy();
    clickCell(app, 300);
    expect(queue(app).jobs).toHaveLength(0);
    act(() => {
      app.host.step(1);
    });
    expect(queue(app).jobs).toEqual([
      expect.objectContaining({ prototypeId: "oven", cellIndex: 300, kind: "Construction" }),
    ]);
  });

  it("lists the reasons a cell is refused and places nothing there", () => {
    const app = renderApp();
    app.start();
    const panel = document.querySelector('[data-panel="build-menu"]') as HTMLElement;
    fireEvent.click(within(panel).getByRole("button", { name: "Oven" }));
    const scene = app.canvas.last?.scene;
    const refused = Array.from({ length: scene?.cellCount ?? 0 }, (_, cell) => cell).find(
      (cell) => {
        const check = app.host.store.query("validate-placement", {
          prototypeId: "oven",
          mapId: 1,
          cellIndex: cell,
        });
        return check.ok && (check.data as unknown as { valid: boolean }).valid === false;
      },
    );
    expect(refused).toBeDefined();
    hoverCell(app, refused ?? 0);
    expect(
      within(panel).getByLabelText("Why this cell is refused").children.length,
    ).toBeGreaterThan(0);
    clickCell(app, refused ?? 0);
    act(() => {
      app.host.step(1);
    });
    expect(queue(app).jobs).toHaveLength(0);
  });

  it("queues walls on the buildable cells of a dragged rectangle with the wall tool", () => {
    const app = renderApp();
    app.start();
    const panel = document.querySelector('[data-panel="build-menu"]') as HTMLElement;
    fireEvent.click(within(panel).getByRole("button", { name: "Wall" }));
    expect(app.host.tools.getSnapshot().mode).toBe(ToolMode.Walls);
    const centers = app.canvas.last?.scene.centers ?? [];
    const expected = cellsInRect(centers, 300, 301).filter((cell) => {
      const check = app.host.store.query("validate-placement", {
        prototypeId: "wall",
        mapId: 1,
        cellIndex: cell,
      });
      return check.ok && (check.data as unknown as { valid: boolean }).valid;
    });
    expect(expected).toContain(300);
    dragOverCells(app, [300, 301]);
    act(() => {
      app.host.step(1);
    });
    const walls = queue(app)
      .jobs.filter((job) => job.prototypeId === "wall")
      .map((job) => job.cellIndex)
      .sort((left, right) => left - right);
    expect(walls).toEqual(expected);
  });

  it("cancels the tool", () => {
    const app = renderApp();
    app.start();
    const panel = document.querySelector('[data-panel="build-menu"]') as HTMLElement;
    fireEvent.click(within(panel).getByRole("button", { name: "Chest" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Cancel" }));
    expect(app.host.tools.getSnapshot().mode).toBe(ToolMode.Inspect);
    expect(screen.queryByText(/Placing/)).toBeNull();
  });
});
/* eslint-enable no-restricted-syntax -- end of the test file */
