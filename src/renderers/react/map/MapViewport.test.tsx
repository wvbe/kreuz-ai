// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { appServicesContext } from "../AppServices";
import { EngineHost } from "../engine/EngineHost";
import { EngineProvider } from "../engine/EngineProvider";
import { squareScene } from "../testing/testScenes";
import { worldToScreen } from "./cameraMath";
import type { MapCanvasProps } from "./MapCanvasProps";
import { MapViewport } from "./MapViewport";

afterEach(cleanup);

const scene = squareScene(10, 10);
const entities = [
  { id: 5, prototype: "farmer", cell: 23, components: ["Citizen", "Needs", "Position"] },
  { id: 6, prototype: "chest", cell: 23, components: ["Furniture", "Position"] },
];

function setup(clicks: [number | null, number | null][]) {
  const host = new EngineHost();
  const seen: { last: MapCanvasProps | null } = { last: null };
  const services = {
    mapCanvas: (props: MapCanvasProps) => {
      seen.last = props;
      return <div data-testid="canvas" />;
    },
    downloadText: () => undefined,
  };
  render(
    <EngineProvider host={host}>
      <appServicesContext.Provider value={services}>
        <MapViewport
          scene={scene}
          entities={entities}
          crops={[]}
          zones={[]}
          showZones
          badges={[{ entityId: 5, label: "Idle" }]}
          ghost={null}
          hoverLabel="Margery the Farmer"
          onPrimaryClick={(cell, entityId) => clicks.push([cell, entityId])}
        />
      </appServicesContext.Provider>
    </EngineProvider>,
  );
  return { host, seen };
}

describe("MapViewport", () => {
  // @covers 024:FR-005
  it("picks the citizen on a shared cell, hovers and clicks", () => {
    const clicks: [number | null, number | null][] = [];
    const { host, seen } = setup(clicks);
    const props = seen.last as MapCanvasProps;
    const spot = worldToScreen(props.camera, props.viewport, scene.centers[23] ?? { x: 0, z: 0 });
    const frame = screen.getByTestId("map-viewport");
    fireEvent.pointerMove(frame, { clientX: spot.x, clientY: spot.y });
    expect(host.selection.getSnapshot()).toMatchObject({ hoverCell: 23, hoverEntityId: 5 });
    expect(screen.getByText("Margery the Farmer")).toBeTruthy();
    fireEvent.pointerDown(frame, { clientX: spot.x, clientY: spot.y, button: 0 });
    fireEvent.pointerUp(frame, { clientX: spot.x, clientY: spot.y, button: 0 });
    expect(clicks).toEqual([[23, 5]]);
  });

  it("reports a click off the map as no cell and clears the hover on leave", () => {
    const clicks: [number | null, number | null][] = [];
    const { host } = setup(clicks);
    const frame = screen.getByTestId("map-viewport");
    fireEvent.pointerDown(frame, { clientX: 1, clientY: 1, button: 0 });
    fireEvent.pointerUp(frame, { clientX: 1, clientY: 1, button: 0 });
    expect(clicks).toEqual([[null, null]]);
    fireEvent.pointerMove(frame, { clientX: 400, clientY: 300 });
    fireEvent.pointerLeave(frame);
    expect(host.selection.getSnapshot().hoverCell).toBeNull();
  });

  it("ignores clicks of other buttons and draws the badge of an entity on the map", () => {
    const clicks: [number | null, number | null][] = [];
    setup(clicks);
    const frame = screen.getByTestId("map-viewport");
    fireEvent.pointerDown(frame, { clientX: 400, clientY: 300, button: 2 });
    fireEvent.pointerUp(frame, { clientX: 400, clientY: 300, button: 2 });
    expect(clicks).toEqual([]);
    expect(document.querySelector('.kv-badge[data-entity="5"]')?.textContent).toBe("Idle");
  });
});
