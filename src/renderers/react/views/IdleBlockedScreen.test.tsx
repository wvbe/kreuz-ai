// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EngineHost } from "../engine/EngineHost";
import { EngineProvider } from "../engine/EngineProvider";
import { Screen } from "../navigation/Screen";
import { createFakeScheduler } from "../testing/fakeScheduler";
import { IdleBlockedScreen } from "./IdleBlockedScreen";

afterEach(cleanup);

function shownHost(): EngineHost {
  const host = new EngineHost({ scheduler: createFakeScheduler().scheduler });
  host.newGame({ seed: 42, difficulty: "steady", mapSize: 0, startingTier: "hamlet" });
  host.step(60);
  host.navigation.navigate(Screen.IdleBlocked);
  render(
    <EngineProvider host={host}>
      <IdleBlockedScreen />
    </EngineProvider>,
  );
  return host;
}

describe("IdleBlockedScreen", () => {
  // @covers 024:FR-026 025:FR-017
  it("groups rows by reason; the settling ones are listed on request", () => {
    shownHost();
    expect(screen.getByRole("heading", { name: "Idle and blocked", level: 2 })).toBeTruthy();
    const settled = screen.queryAllByRole("button").length;
    fireEvent.click(screen.getByRole("checkbox"));
    const all = screen.queryAllByRole("button").length;
    expect(all).toBeGreaterThan(0);
    expect(all).toBeGreaterThanOrEqual(settled);
    expect(screen.getByRole("region", { name: "Awaiting worker" })).toBeTruthy();
  });

  it("does nothing for a subject that has no place on the map", () => {
    const host = shownHost();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getAllByRole("button")[0] as HTMLElement);
    expect(host.selection.getSnapshot().focus).toBeNull();
    expect(host.navigation.getSnapshot().screen).toBe(Screen.IdleBlocked);
  });
});
