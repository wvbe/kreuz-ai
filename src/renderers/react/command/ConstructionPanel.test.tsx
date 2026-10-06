// @vitest-environment jsdom
/* eslint-disable no-restricted-syntax, @typescript-eslint/naming-convention -- tests read typed views out of query JSON and spawn prototypes with component-name overrides */
import { act, cleanup, fireEvent, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ConstructionQueueView } from "../../../game/construction/constructionViews";
import { renderApp } from "../testing/renderApp";
import type { RenderedApp } from "../testing/renderApp";

afterEach(cleanup);

function queue(app: RenderedApp): ConstructionQueueView {
  const result = app.host.store.query("construction-queue", {});
  if (!result.ok) {
    throw new Error("no queue");
  }
  return result.data as unknown as ConstructionQueueView;
}

function panel(): HTMLElement {
  return document.querySelector('[data-panel="construction"]') as HTMLElement;
}

function step(app: RenderedApp): void {
  act(() => {
    app.host.step(1);
  });
}

describe("ConstructionPanel", () => {
  it("lists a queued site and pauses, reprioritises, moves to front and cancels it", () => {
    const app = renderApp();
    app.start();
    expect(within(panel()).getByText("No construction jobs.")).toBeTruthy();
    act(() => {
      app.host.commands.placeBuild("chest", 1, [300]);
    });
    step(app);
    const job = queue(app).jobs[0];
    expect(job?.prototypeId).toBe("chest");
    const jobId = job?.jobId ?? 0;

    fireEvent.click(within(panel()).getByRole("button", { name: "Pause" }));
    step(app);
    expect(queue(app).jobs[0]?.paused).toBe(true);
    fireEvent.click(within(panel()).getByRole("button", { name: "Resume" }));
    step(app);
    expect(queue(app).jobs[0]?.paused).toBe(false);

    fireEvent.change(within(panel()).getByLabelText(`Priority of job ${jobId}`), {
      target: { value: "80" },
    });
    fireEvent.click(within(panel()).getByRole("button", { name: "Set priority" }));
    step(app);
    expect(queue(app).jobs[0]?.priority).toBe(80);

    fireEvent.click(within(panel()).getByRole("button", { name: "To front" }));
    step(app);
    expect(queue(app).jobs).toHaveLength(1);

    fireEvent.click(within(panel()).getByRole("button", { name: "Cancel" }));
    step(app);
    expect(queue(app).jobs).toHaveLength(0);
  });

  it("takes down a built piece selected on the map", () => {
    const app = renderApp();
    app.start();
    const chest = app.host.session.engine.store.spawn("chest", {
      Position: { mapId: 1, cellIndex: 301 },
    });
    act(() => {
      app.host.selection.selectEntity(chest.id, 301);
    });
    fireEvent.click(within(panel()).getByRole("button", { name: "Deconstruct" }));
    step(app);
    expect(queue(app).jobs).toEqual([
      expect.objectContaining({ kind: "Deconstruction", targetEntityId: chest.id }),
    ]);
  });
});
/* eslint-enable no-restricted-syntax, @typescript-eslint/naming-convention -- end of the test file */
