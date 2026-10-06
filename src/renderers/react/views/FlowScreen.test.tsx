// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EngineHost } from "../engine/EngineHost";
import { EngineProvider } from "../engine/EngineProvider";
import { createFakeScheduler } from "../testing/fakeScheduler";
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
});
