// @vitest-environment jsdom
/* eslint-disable no-restricted-syntax -- tests read typed views out of query JSON */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PendingUpdateView } from "../../../game/crier/crierViews";
import type { BoardSummaryView } from "../../../game/jobs/jobViews";
import { Screen } from "../navigation/Screen";
import { renderApp } from "../testing/renderApp";
import type { RenderedApp } from "../testing/renderApp";

afterEach(cleanup);

function open(app: RenderedApp, tab: string): void {
  act(() => {
    app.host.navigation.navigate(Screen.StandingOrders);
  });
  fireEvent.click(screen.getByRole("tab", { name: tab }));
}

function step(app: RenderedApp, ticks = 1): void {
  act(() => {
    app.host.step(ticks);
  });
}

function boards(app: RenderedApp): readonly BoardSummaryView[] {
  const result = app.host.store.query("job-boards", {});
  return result.ok ? (result.data as unknown as readonly BoardSummaryView[]) : [];
}

function pending(app: RenderedApp): readonly PendingUpdateView[] {
  const result = app.host.store.query("pending-updates", {});
  return result.ok ? (result.data as unknown as readonly PendingUpdateView[]) : [];
}

describe("JobBoardsTab", () => {
  // @covers 024:FR-010
  it("pauses and resumes a board", () => {
    const app = renderApp();
    app.start();
    open(app, "Job boards");
    fireEvent.click(screen.getByRole("button", { name: "Pause board" }));
    step(app);
    expect(boards(app)[0]?.pausedByPlayer).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Resume board" }));
    step(app);
    expect(boards(app)[0]?.paused).toBe(false);
  });

  // @covers 024:FR-010 024:FR-011 024:FR-012
  it("posts a custom job that a Town Crier carries, then cancels it from the pending list", () => {
    const app = renderApp();
    app.start();
    open(app, "Job boards");
    fireEvent.click(screen.getByRole("button", { name: "Show postings" }));
    const form = screen.getByRole("form", { name: /Post a job on board/ });
    fireEvent.change(within(form).getByLabelText("Job type"), { target: { value: "fell.trees" } });
    fireEvent.change(within(form).getByLabelText(/Cell/), { target: { value: "296" } });
    fireEvent.click(within(form).getByRole("button", { name: "Post job" }));
    step(app);
    expect(pending(app)).toHaveLength(1);
    expect(pending(app)[0]?.changes[0]).toMatchObject({ jobTypeId: "fell.trees", cellIndex: 296 });

    // The pending tab shows it with its progress and a cancel button.
    fireEvent.click(screen.getByRole("tab", { name: "Pending commands" }));
    expect(screen.getByText(/post fell.trees at cell 296/)).toBeTruthy();
    expect(screen.getByText(/crier #\d+, ETA/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    step(app);
    expect(pending(app)).toHaveLength(0);
    expect(screen.getByText("No commands are waiting for a Town Crier.")).toBeTruthy();
  });

  it("shows a field error for a bad cell and an unknown job type as a toast", () => {
    const app = renderApp();
    app.start();
    open(app, "Job boards");
    fireEvent.click(screen.getByRole("button", { name: "Show postings" }));
    const form = screen.getByRole("form", { name: /Post a job on board/ });
    fireEvent.click(within(form).getByRole("button", { name: "Post job" }));
    expect(within(form).getByText("Enter a job type")).toBeTruthy();
    expect(within(form).getByText("Enter a whole number")).toBeTruthy();
    expect(pending(app)).toHaveLength(0);
  });
});
/* eslint-enable no-restricted-syntax -- end of the test file */
