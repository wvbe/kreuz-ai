import { fireEvent, screen } from "@testing-library/react";
import { worldToScreen } from "../map/cameraMath";
import type { RenderedApp } from "./renderApp";

/**
 * Where a cell is on the screen of the test viewport (the camera the stub canvas last got).
 *
 * @param app - The rendered app.
 * @param cell - A cell of the active map.
 * @returns Client coordinates of the cell centre.
 * @throws {Error} When the map has not rendered yet or the cell does not exist.
 */
export function screenOfCell(app: RenderedApp, cell: number): { x: number; y: number } {
  const props = app.canvas.last;
  const center = props?.scene.centers[cell];
  if (props === null || center === undefined) {
    throw new Error(`cell ${cell} is not on the rendered map`);
  }
  return worldToScreen(props.camera, props.viewport, center);
}

/**
 * Moves the pointer over a cell (the ghost and the hover follow).
 *
 * @param app - The rendered app.
 * @param cell - The cell to hover.
 */
export function hoverCell(app: RenderedApp, cell: number): void {
  const spot = screenOfCell(app, cell);
  fireEvent.pointerMove(screen.getByTestId("map-viewport"), { clientX: spot.x, clientY: spot.y });
}

/**
 * Clicks a cell with the primary button.
 *
 * @param app - The rendered app.
 * @param cell - The cell to click.
 */
export function clickCell(app: RenderedApp, cell: number): void {
  const spot = screenOfCell(app, cell);
  const frame = screen.getByTestId("map-viewport");
  fireEvent.pointerMove(frame, { clientX: spot.x, clientY: spot.y });
  fireEvent.pointerDown(frame, { clientX: spot.x, clientY: spot.y, button: 0 });
  fireEvent.pointerUp(frame, { clientX: spot.x, clientY: spot.y, button: 0 });
}

/**
 * Drags the primary button over a path of cells (press on the first, move over the rest, release
 * on the last), as a zone-painting or wall-rectangle gesture.
 *
 * @param app - The rendered app.
 * @param path - The cells to pass over, at least one.
 */
export function dragOverCells(app: RenderedApp, path: readonly number[]): void {
  const frame = screen.getByTestId("map-viewport");
  const first = path[0];
  const last = path[path.length - 1];
  if (first === undefined || last === undefined) {
    return;
  }
  const start = screenOfCell(app, first);
  fireEvent.pointerMove(frame, { clientX: start.x, clientY: start.y });
  fireEvent.pointerDown(frame, { clientX: start.x, clientY: start.y, button: 0 });
  for (const cell of path.slice(1)) {
    const spot = screenOfCell(app, cell);
    fireEvent.pointerMove(frame, { clientX: spot.x, clientY: spot.y });
  }
  const end = screenOfCell(app, last);
  fireEvent.pointerUp(frame, { clientX: end.x, clientY: end.y, button: 0 });
}
