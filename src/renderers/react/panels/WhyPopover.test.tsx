// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildBlockedBakery, renderPanel, startedHost } from "../testing/renderPanel";
import { ExplanationView, WhyPopover } from "./WhyPopover";
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
  renderPanel(<ExplanationView explanation={explanation} />, startedHost());
}

describe("WhyPopover", () => {
  it("opens on click and explains the subject from the engine", () => {
    const host = startedHost("village");
    const { oven } = buildBlockedBakery(host);
    renderPanel(<WhyPopover id={oven} />, host);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "why?" }));
    expect(screen.getByRole("dialog", { name: "Why?" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Cause chain" })).toBeTruthy();
  });

  it("explains a production order by its kind", () => {
    const host = startedHost("village");
    buildBlockedBakery(host);
    renderPanel(<WhyPopover id={1} kind="ProductionOrder" />, host);
    fireEvent.click(screen.getByRole("button", { name: "why?" }));
    expect(screen.getByText(/Missing input: flour/)).toBeTruthy();
    expect(screen.getByText("Workstation #", { exact: false })).toBeTruthy();
  });
});

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
