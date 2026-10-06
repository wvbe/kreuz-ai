// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { firstEntityOf, renderPanel, startedHost } from "../testing/renderPanel";
import { OccupantCycler } from "./OccupantCycler";

afterEach(cleanup);

describe("OccupantCycler", () => {
  it("cycles the selection through the entities that share a tile", () => {
    const host = startedHost();
    const chest = firstEntityOf(host, "chest");
    const position = host.session.query.entity(chest)?.components["Position"] as {
      mapId: number;
      cellIndex: number;
    };
    const spawned = host.session.dispatch({
      kind: "DebugSpawn",
      prototypeId: "chest",
      mapId: position.mapId,
      cells: [position.cellIndex],
    });
    expect(spawned.ok).toBe(true);
    act(() => {
      host.step(2);
    });
    renderPanel(
      <OccupantCycler mapId={position.mapId} cell={position.cellIndex} current={null} />,
      host,
    );
    expect(screen.getByText(/entities share this tile/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next on this tile" }));
    expect(host.selection.getSnapshot().entityId).not.toBeNull();
  });

  it("renders nothing for a tile with fewer than two entities", () => {
    const host = startedHost();
    const { container } = renderPanel(<OccupantCycler mapId={1} cell={0} current={null} />, host);
    expect(container.textContent).toBe("");
  });
});
