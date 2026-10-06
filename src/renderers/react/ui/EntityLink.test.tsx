// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { firstEntityOf, renderPanel, startedHost } from "../testing/renderPanel";
import { EntityLink, Link, selectAndFocus } from "./EntityLink";

afterEach(cleanup);

describe("EntityLink", () => {
  it("Link calls its handler", () => {
    let clicks = 0;
    render(
      <Link
        label="Go"
        onClick={() => {
          clicks += 1;
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(clicks).toBe(1);
  });

  // @covers 024:FR-008
  it("selects the entity and centres the map on its cell", () => {
    const host = startedHost();
    const chest = firstEntityOf(host, "chest");
    renderPanel(<EntityLink entityId={chest} label="the chest" />, host);
    fireEvent.click(screen.getByRole("button", { name: "the chest" }));
    const selection = host.selection.getSnapshot();
    expect(selection.entityId).toBe(chest);
    expect(selection.cell).not.toBeNull();
    expect(selection.focus?.cell).toBe(selection.cell);
  });

  it("selects an entity without a place and leaves the camera alone", () => {
    const host = startedHost();
    const board = firstEntityOf(host, "job_board");
    selectAndFocus(host, board);
    expect(host.selection.getSnapshot().entityId).toBe(board);
  });
});
