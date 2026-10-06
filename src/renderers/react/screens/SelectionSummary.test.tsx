// @vitest-environment jsdom
import { act, cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderApp } from "../testing/renderApp";

afterEach(cleanup);

describe("SelectionSummary", () => {
  it("shows a selected cell, then an entity with its styled name", () => {
    const app = renderApp();
    app.start();
    act(() => {
      app.host.selection.selectCell(12);
    });
    expect(screen.getByText("Cell 12")).toBeTruthy();
    const citizen = app.canvas.last?.entities.find((entity) => entity.components.includes("Needs"));
    act(() => {
      app.host.selection.selectEntity(citizen?.id ?? null, citizen?.cell ?? null);
    });
    const identity = app.host.session.query.run("identity-of", { entityId: citizen?.id ?? 0 });
    const styled = identity.ok ? (identity.data as { styledName: string }).styledName : "";
    expect(screen.getByText(new RegExp(styled))).toBeTruthy();
  });
});
