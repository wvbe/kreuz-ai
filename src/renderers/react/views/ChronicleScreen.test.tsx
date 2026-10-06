// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EngineHost } from "../engine/EngineHost";
import { EngineProvider } from "../engine/EngineProvider";
import { createFakeScheduler } from "../testing/fakeScheduler";
import { chronicleRequests } from "./chronicleRequests";
import { ChronicleScreen, chronicleKinds, CitizenJournal } from "./ChronicleScreen";

afterEach(() => {
  cleanup();
  chronicleRequests.clear();
});

function startedHost(): EngineHost {
  const host = new EngineHost({ scheduler: createFakeScheduler().scheduler });
  host.newGame({ seed: 42, difficulty: "steady", mapSize: 0, startingTier: "hamlet" });
  return host;
}

describe("ChronicleScreen", () => {
  // @covers 024:FR-041
  it("shows the count line and offers every kind as a filter", () => {
    render(
      <EngineProvider host={startedHost()}>
        <ChronicleScreen />
      </EngineProvider>,
    );
    expect(screen.getByText(/entries \(the chronicle keeps/)).toBeTruthy();
    expect(screen.getByLabelText("Kind").querySelectorAll("option")).toHaveLength(
      chronicleKinds.length + 1,
    );
  });

  // @covers 024:FR-041
  it("switches to a citizen's journal when asked", () => {
    chronicleRequests.set({ entityId: 3, kind: null, journal: true });
    render(
      <EngineProvider host={startedHost()}>
        <ChronicleScreen />
      </EngineProvider>,
    );
    expect(screen.getByText(/has come to the hamlet/)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.queryByText(/has come to the hamlet/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Citizen id"), { target: { value: "" } });
    expect(chronicleRequests.getSnapshot().entityId).toBeNull();
  });

  it("renders a journal as a component and a missing one as a note", () => {
    render(
      <EngineProvider host={startedHost()}>
        <CitizenJournal entityId={3} />
        <CitizenJournal entityId={999_999} />
      </EngineProvider>,
    );
    expect(screen.getByText(/has come to the hamlet/)).toBeTruthy();
    expect(screen.getByText("This citizen has no journal.")).toBeTruthy();
  });
});
