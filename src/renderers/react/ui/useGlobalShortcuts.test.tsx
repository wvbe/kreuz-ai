// @vitest-environment jsdom
import { act, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { StateView } from "../../../game/api/Views";
import { renderApp } from "../testing/renderApp";
import type { RenderedApp } from "../testing/renderApp";
import { keyboardShortcuts } from "./useGlobalShortcuts";

afterEach(cleanup);

// Commands are queued and applied by the next tick (docs/UI.md), so every key is followed by a step.
function key(app: RenderedApp, name: string, target: Element | Window = window, modifiers = {}) {
  act(() => {
    fireEvent.keyDown(target, { key: name, ...modifiers });
    app.host.step(1);
  });
}

function timeOf(app: RenderedApp): StateView["time"] {
  const result = app.host.session.query.run("state", {});
  if (!result.ok) {
    throw new Error("no state");
  }
  // The `state` query returns exactly a StateView (see api/Views.ts).
  // eslint-disable-next-line no-restricted-syntax -- JSON to the documented view type of the query name
  return (result.data as unknown as StateView).time;
}

describe("useGlobalShortcuts", () => {
  // @covers 024:FR-002
  it("pauses and resumes with Space and sets the speed with 1 to 5", () => {
    const app = renderApp();
    app.start();
    const before = timeOf(app).paused;
    key(app, " ");
    expect(timeOf(app).paused).toBe(!before);
    key(app, " ");
    expect(timeOf(app).paused).toBe(before);
    key(app, "5");
    expect(timeOf(app).speed).toBe(4000);
    key(app, "1");
    expect(timeOf(app).speed).toBe(250);
    key(app, "3");
    expect(timeOf(app).speed).toBe(1000);
  });

  // @covers 024:FR-002
  it("leaves the keys to form controls and buttons, and to a modified key", () => {
    const app = renderApp();
    app.start();
    const before = timeOf(app).paused;
    const input = document.createElement("input");
    document.body.appendChild(input);
    key(app, " ", input);
    const button = document.querySelector("button");
    expect(button).not.toBeNull();
    key(app, " ", button as Element);
    key(app, " ", window, { ctrlKey: true });
    key(app, "5", input);
    expect(timeOf(app).paused).toBe(before);
    expect(timeOf(app).speed).toBe(1000);
    input.remove();
  });

  it("does nothing without a game", () => {
    const app = renderApp();
    key(app, " ");
    expect(app.host.session.hasGame).toBe(false);
  });

  it("documents the shortcuts", () => {
    expect(keyboardShortcuts.map((entry) => entry.keys)).toContain("Space");
    expect(keyboardShortcuts.length).toBeGreaterThanOrEqual(4);
  });
});
