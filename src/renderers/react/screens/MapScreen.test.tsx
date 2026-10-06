// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { worldToScreen } from "../map/cameraMath";
import { classifyEntity, VisualKind, wildAnimalMarker } from "../map/entityVisuals";
import { renderApp } from "../testing/renderApp";
import type { RenderedApp } from "../testing/renderApp";

afterEach(cleanup);

function startGame(): RenderedApp {
  const app = renderApp();
  app.start();
  act(() => {
    app.host.step(1);
  });
  return app;
}

function screenOfCell(app: RenderedApp, cell: number): { x: number; y: number } {
  const props = app.canvas.last;
  if (props === null) {
    throw new Error("no canvas props");
  }
  const center = props.scene.centers[cell];
  if (center === undefined) {
    throw new Error("no such cell");
  }
  return worldToScreen(props.camera, props.viewport, center);
}

function citizenCell(app: RenderedApp): { id: number; cell: number } {
  const entity = app.canvas.last?.entities.find(
    (candidate) => classifyEntity(candidate) === VisualKind.Citizen,
  );
  if (entity === undefined) {
    throw new Error("no citizen on the map");
  }
  return { id: entity.id, cell: entity.cell };
}

describe("MapScreen", () => {
  // @covers 024:FR-002 024:FR-004
  it("hands the active map, its entities and the zones to the canvas", () => {
    const app = startGame();
    const props = app.canvas.last;
    expect(props?.scene.cellCount).toBe(600);
    expect(props?.scene.voronoi).toBe(true);
    expect(props?.entities.length).toBeGreaterThan(3);
    expect(app.host.selection.getSnapshot().activeMapId).toBe(1);
    expect(screen.queryByRole("navigation", { name: "Maps" })).toBeNull();
  });

  // @covers 024:FR-004
  it("draws wild animals differently from livestock", () => {
    const app = startGame();
    const kinds = new Set(
      (app.canvas.last?.entities ?? []).map((entity) => classifyEntity(entity)),
    );
    expect(kinds.has(VisualKind.Citizen)).toBe(true);
    const wild = (app.canvas.last?.entities ?? []).filter((entity) =>
      entity.components.includes(wildAnimalMarker),
    );
    const animals = app.host.session.query.run("animals", { kind: "wild" });
    const expected = animals.ok ? (animals.data as { animals: object[] }).animals.length : 0;
    expect(wild.length).toBe(expected);
    expect(expected).toBeGreaterThan(0);
    expect(wild.every((entity) => classifyEntity(entity) === VisualKind.WildAnimal)).toBe(true);
  });

  // @covers 024:FR-005 024:FR-038
  it("hovers an entity, labels it with its styled name and selects it on click", () => {
    const app = startGame();
    const citizen = citizenCell(app);
    const spot = screenOfCell(app, citizen.cell);
    const viewport = screen.getByTestId("map-viewport");
    fireEvent.pointerMove(viewport, { clientX: spot.x, clientY: spot.y });
    expect(app.host.selection.getSnapshot().hoverCell).toBe(citizen.cell);
    expect(app.host.selection.getSnapshot().hoverEntityId).not.toBeNull();
    const hovered = app.host.selection.getSnapshot().hoverEntityId as number;
    const identity = app.host.session.query.run("identity-of", { entityId: hovered });
    if (identity.ok && identity.data !== null && !Array.isArray(identity.data)) {
      expect(
        screen.getByText(String((identity.data as { styledName: string }).styledName)),
      ).toBeTruthy();
    }
    fireEvent.pointerDown(viewport, { clientX: spot.x, clientY: spot.y, button: 0 });
    fireEvent.pointerUp(viewport, { clientX: spot.x, clientY: spot.y, button: 0 });
    expect(app.host.selection.getSnapshot().entityId).toBe(hovered);
    expect(app.host.selection.getSnapshot().cell).toBe(citizen.cell);
    expect(screen.getByText(/#\d+/)).toBeTruthy();
  });

  it("selects an empty cell and clears with Escape", () => {
    const app = startGame();
    const props = app.canvas.last;
    const occupied = new Set(props?.entities.map((entity) => entity.cell));
    const free = [...(props?.scene.centers.keys() ?? [])].find((cell) => !occupied.has(cell)) ?? 0;
    const spot = screenOfCell(app, free);
    const viewport = screen.getByTestId("map-viewport");
    fireEvent.pointerDown(viewport, { clientX: spot.x, clientY: spot.y, button: 0 });
    fireEvent.pointerUp(viewport, { clientX: spot.x, clientY: spot.y, button: 0 });
    expect(app.host.selection.getSnapshot()).toMatchObject({ cell: free, entityId: null });
    fireEvent.keyDown(viewport, { key: "Escape" });
    expect(app.host.selection.getSnapshot().cell).toBeNull();
  });

  it("drags to pan without selecting, and zooms with the wheel", () => {
    const app = startGame();
    const viewport = screen.getByTestId("map-viewport");
    const before = app.canvas.last?.camera;
    fireEvent.pointerDown(viewport, { clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerMove(viewport, { clientX: 160, clientY: 130 });
    fireEvent.pointerUp(viewport, { clientX: 160, clientY: 130, button: 0 });
    const panned = app.canvas.last?.camera;
    expect(panned?.centerX).not.toBe(before?.centerX);
    expect(app.host.selection.getSnapshot().cell).toBeNull();
    fireEvent.wheel(viewport, { deltaY: -100, clientX: 400, clientY: 300 });
    expect((app.canvas.last?.camera.zoom ?? 0) > (panned?.zoom ?? 0)).toBe(true);
  });

  it("rotates with the buttons and the Q and E keys", () => {
    const app = startGame();
    const viewport = screen.getByTestId("map-viewport");
    const start = app.canvas.last?.camera.rotation ?? 0;
    fireEvent.click(screen.getByRole("button", { name: "Rotate right" }));
    expect(app.canvas.last?.camera.rotation).toBeCloseTo(start + Math.PI / 4);
    fireEvent.keyDown(viewport, { key: "q" });
    expect(app.canvas.last?.camera.rotation).toBeCloseTo(start);
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
  });

  // @covers 024:FR-014
  it("shows the placement ghost in placement mode: red on rock, green on open ground, and places on click", () => {
    const app = startGame();
    const props = app.canvas.last;
    const terrain = props?.scene.terrain ?? [];
    const rock = terrain.findIndex((id) => id === "mountain");
    const grass = terrain.findIndex(
      (id, cell) =>
        id === "grassland" && !(props?.entities ?? []).some((entity) => entity.cell === cell),
    );
    act(() => {
      app.host.tools.enterPlacement("chest");
    });
    const viewport = screen.getByTestId("map-viewport");
    const rockAt = screenOfCell(app, rock);
    fireEvent.pointerMove(viewport, { clientX: rockAt.x, clientY: rockAt.y });
    expect(app.canvas.last?.ghost).toMatchObject({
      prototypeId: "chest",
      cell: rock,
      valid: false,
    });
    const grassAt = screenOfCell(app, grass);
    fireEvent.pointerMove(viewport, { clientX: grassAt.x, clientY: grassAt.y });
    expect(app.canvas.last?.ghost).toMatchObject({ cell: grass, valid: true });
    fireEvent.pointerDown(viewport, { clientX: grassAt.x, clientY: grassAt.y, button: 0 });
    fireEvent.pointerUp(viewport, { clientX: grassAt.x, clientY: grassAt.y, button: 0 });
    expect(app.host.session.query.pendingCommands().commands.map((entry) => entry.kind)).toContain(
      "PlaceFurniture",
    );
    expect(app.host.tools.getSnapshot().prototypeId).toBe("chest");
    fireEvent.pointerMove(viewport, { clientX: rockAt.x, clientY: rockAt.y });
    fireEvent.pointerDown(viewport, { clientX: rockAt.x, clientY: rockAt.y, button: 0 });
    fireEvent.pointerUp(viewport, { clientX: rockAt.x, clientY: rockAt.y, button: 0 });
    expect(
      app.host.session.query
        .pendingCommands()
        .commands.filter((entry) => entry.kind === "PlaceFurniture"),
    ).toHaveLength(1);
  });

  // @covers 024:FR-025
  it("shows badges for settled idle citizens and hides them in the settings", () => {
    const app = startGame();
    act(() => {
      app.host.step(200);
    });
    expect(document.querySelectorAll(".kv-badge").length).toBeGreaterThan(0);
    act(() => {
      app.host.setPrefs({ showBadges: false });
    });
    expect(document.querySelectorAll(".kv-badge").length).toBe(0);
  });

  it("centres the camera on a focus request and shows the zone overlay data", () => {
    const app = startGame();
    act(() => {
      app.host.dispatch({ kind: "DesignateZone", zoneTypeId: "stockpile", mapId: 1, cells: [257] });
      app.host.step(2);
    });
    expect(app.canvas.last?.zones.map((zone) => zone.zoneTypeId)).toContain("stockpile");
    act(() => {
      app.host.selection.requestFocus(1, 100);
    });
    const center = app.canvas.last?.scene.centers[100];
    expect(app.canvas.last?.camera.centerX).toBeCloseTo(center?.x ?? -1);
    expect(app.canvas.last?.camera.centerZ).toBeCloseTo(center?.z ?? -1);
  });
});
