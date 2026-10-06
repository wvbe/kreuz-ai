// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createFakeScheduler } from "../testing/fakeScheduler";
import { EngineHost } from "./EngineHost";
import { EngineProvider } from "./EngineProvider";
import { useEvents, useGameState, useGameVersion, useQuery } from "./useGameState";

afterEach(cleanup);

function selectTick(state: { time: { tick: number } }): number {
  return state.time.tick;
}

function Probe() {
  const tick = useGameState(selectTick);
  const version = useGameVersion();
  const maps = useQuery("maps");
  const missing = useQuery<{ x: number }>("no-such-query");
  const events = useEvents("command.*");
  return (
    <ul>
      <li data-testid="tick">{tick}</li>
      <li data-testid="version">{version}</li>
      <li data-testid="maps">{maps.ok ? maps.data.maps.length : -1}</li>
      <li data-testid="missing">{missing.ok ? "ok" : missing.error.kind}</li>
      <li data-testid="events">{events.map((event) => event.name).join(",")}</li>
    </ul>
  );
}

function setup() {
  const fake = createFakeScheduler();
  const host = new EngineHost({ scheduler: fake.scheduler });
  host.newGame({ seed: 42, difficulty: "steady", mapSize: 0, startingTier: "hamlet" });
  render(
    <EngineProvider host={host}>
      <Probe />
    </EngineProvider>,
  );
  return { host, fake };
}

describe("game state hooks", () => {
  it("re-render with the game: tick, version, queries and events", () => {
    const { host, fake } = setup();
    expect(screen.getByTestId("tick").textContent).toBe("0");
    expect(screen.getByTestId("maps").textContent).toBe("1");
    expect(screen.getByTestId("missing").textContent).toBe("unknown-query");
    const version = Number(screen.getByTestId("version").textContent);
    act(() => {
      fake.fireMany(3);
    });
    expect(screen.getByTestId("tick").textContent).toBe("3");
    expect(Number(screen.getByTestId("version").textContent)).toBeGreaterThan(version);
    act(() => {
      host.dispatch({ kind: "DesignateZone", zoneTypeId: "no_such_zone", mapId: 1, cells: [1] });
      host.step(1);
    });
    expect(screen.getByTestId("events").textContent).toContain("command.rejected");
  });
});
