// @vitest-environment jsdom
import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { clickCell, dragOverCells, hoverCell, screenOfCell } from "./mapGestures";
import { renderApp } from "./renderApp";

afterEach(cleanup);

describe("map gestures", () => {
  it("hover and click act on the cell they aim at", () => {
    const app = renderApp();
    app.start();
    hoverCell(app, 300);
    expect(app.host.selection.getSnapshot().hoverCell).toBe(300);
    clickCell(app, 301);
    expect(app.host.selection.getSnapshot().cell).toBe(301);
  });

  it("a drag with no path does nothing and an unknown cell is an error", () => {
    const app = renderApp();
    app.start();
    dragOverCells(app, []);
    expect(() => screenOfCell(app, 999999)).toThrow(/not on the rendered map/);
  });
});
