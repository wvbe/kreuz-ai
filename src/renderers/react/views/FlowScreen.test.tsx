// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EngineHost } from "../engine/EngineHost";
import { EngineProvider } from "../engine/EngineProvider";
import { createFakeScheduler } from "../testing/fakeScheduler";
import { Screen } from "../navigation/Screen";
import { takeContentRequest } from "../screens/contentRequests";
import { formatPerDay } from "./flowFormat";
import type { FlowRow } from "../../../game/status/statusTypes";
import { FlowScreen } from "./FlowScreen";

afterEach(cleanup);

function startedHost(): EngineHost {
  const host = new EngineHost({ scheduler: createFakeScheduler().scheduler });
  host.newGame({ seed: 42, difficulty: "steady", mapSize: 0, startingTier: "hamlet" });
  return host;
}

describe("FlowScreen", () => {
  // @covers 024:FR-027
  it("says so while nothing was produced or consumed", () => {
    render(
      <EngineProvider host={startedHost()}>
        <FlowScreen />
      </EngineProvider>,
    );
    expect(screen.getByRole("heading", { name: "Production flow" })).toBeTruthy();
    expect(screen.getByText("No production or consumption recorded yet.")).toBeTruthy();
  });

  // @covers 025:FR-018 025:SC-008 024:FR-027
  it("shows the numbers of the flow query for every material and links names to the content browser", () => {
    const host = startedHost();
    act(() => {
      host.step(300);
    });
    render(
      <EngineProvider host={host}>
        <FlowScreen />
      </EngineProvider>,
    );
    const result = host.store.query("flow", {});
    // eslint-disable-next-line no-restricted-syntax -- the test reads the documented view out of the query JSON
    const rows = result.ok ? (result.data as unknown as FlowRow[]) : [];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const line = document.querySelector(`tr[data-material="${row.materialId}"]`) as HTMLElement;
      const cells = within(line).getAllByRole("cell");
      expect(cells[0]?.textContent).toBe(formatPerDay(row.producedPerDayMilli));
      expect(cells[1]?.textContent).toBe(formatPerDay(row.consumedPerDayMilli));
      expect(cells[2]?.textContent).toBe(formatPerDay(row.netPerDayMilli));
      expect(cells[3]?.textContent).toBe(String(row.stock));
      expect(cells[4]?.textContent).toBe(
        row.daysOfSupplyMilli === null ? "surplus" : formatPerDay(row.daysOfSupplyMilli),
      );
    }
    const first = rows[0];
    const name = (first?.materialId ?? "").replaceAll("_", " ");
    fireEvent.click(screen.getByRole("button", { name }));
    expect(host.navigation.getSnapshot().screen).toBe(Screen.Content);
    expect(takeContentRequest()).toEqual({ kind: "material", id: first?.materialId });
  });
});
