// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { MapGeometryView } from "../../../game/api/Views";
import { EngineHost } from "./EngineHost";
import { EngineProvider } from "./EngineProvider";
import { useGameVersion } from "./useGameState";
import { useStaticQuery } from "./useStaticQuery";

afterEach(cleanup);

const seen: MapGeometryView[] = [];

function Probe() {
  useGameVersion();
  const geometry = useStaticQuery<MapGeometryView>("map-geometry", { mapId: 1 });
  if (geometry.ok) {
    seen.push(geometry.data);
  }
  return <p data-testid="polygons">{geometry.ok ? geometry.data.polygons.length : -1}</p>;
}

describe("useStaticQuery", () => {
  it("computes once per game, not once per tick", () => {
    seen.length = 0;
    const host = new EngineHost();
    host.newGame({ seed: 42, difficulty: "steady", mapSize: 0, startingTier: "hamlet" });
    render(
      <EngineProvider host={host}>
        <Probe />
      </EngineProvider>,
    );
    expect(screen.getByTestId("polygons").textContent).toBe("600");
    act(() => {
      host.step(3);
    });
    expect(new Set(seen).size).toBe(1);
    act(() => {
      host.newGame({ seed: 7, difficulty: "steady", mapSize: 0, startingTier: "hamlet" });
    });
    expect(new Set(seen).size).toBe(2);
  });
});
