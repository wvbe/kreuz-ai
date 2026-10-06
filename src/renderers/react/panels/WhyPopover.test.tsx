// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EngineProvider } from "../engine/EngineProvider";
import { EngineHost } from "../engine/EngineHost";
import { ExplanationView } from "./WhyPopover";
import type { StatusChainLink, StatusExplanation } from "./statusViews";

afterEach(cleanup);

function link(kind: string, id: number, next: number | null): StatusChainLink {
  return {
    subject: { kind, id },
    state: "Blocked",
    activity: null,
    reason: {
      kind: "MissingWorkstation",
      params: {},
      causeRef: next === null ? null : { kind, id: next },
    },
  };
}

function show(explanation: StatusExplanation): void {
  render(
    <EngineProvider host={new EngineHost()}>
      <ExplanationView explanation={explanation} />
    </EngineProvider>,
  );
}

describe("ExplanationView", () => {
  it("draws a looping chain once per subject and says it loops", () => {
    show({
      subject: { kind: "Workstation", id: 1 },
      state: "Blocked",
      activity: null,
      reasons: [
        { kind: "MissingWorkstation", params: {}, causeRef: { kind: "Workstation", id: 2 } },
      ],
      chain: [
        link("Workstation", 1, 2),
        link("Workstation", 2, 1),
        link("Workstation", 1, 2),
        link("Workstation", 2, 1),
      ],
      end: "Cycle",
    });
    expect(screen.getAllByRole("button", { name: /Workstation #/ })).toHaveLength(1);
    expect(screen.getByText(/loops back/)).toBeTruthy();
  });

  it("caps a very long chain and leaves non-entity subjects unlinked", () => {
    show({
      subject: { kind: "ProductionOrder", id: 1 },
      state: "Blocked",
      activity: null,
      reasons: [],
      chain: [
        link("ProductionOrder", 1, 2),
        link("ProductionOrder", 2, 3),
        ...Array.from({ length: 30 }, (_, index) => link("Citizen", 10 + index, null)),
      ],
      end: "DepthCap",
    });
    expect(screen.getByText("ProductionOrder #2")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Citizen #/ }).length).toBeLessThanOrEqual(11);
    expect(screen.getByText(/only the first causes/)).toBeTruthy();
  });
});
