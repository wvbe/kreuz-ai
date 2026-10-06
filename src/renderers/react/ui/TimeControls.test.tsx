// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderApp } from "../testing/renderApp";

afterEach(cleanup);

function started() {
  const app = renderApp();
  app.start();
  return app;
}

describe("TimeControls", () => {
  it("says there is no game before one starts", () => {
    renderApp();
    expect(screen.getByText("No game running")).toBeTruthy();
  });

  it("pauses, resumes and steps through commands", () => {
    const app = started();
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(app.host.session.query.time().paused).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Step" }));
    expect(app.host.session.tick).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(app.host.session.query.time().paused).toBe(false);
    act(() => {
      app.fake.fireMany(2);
    });
    expect(screen.getByText(/tick 2/)).toBeTruthy();
  });

  it("sets the speed and marks the active one", () => {
    const app = started();
    fireEvent.click(screen.getByRole("button", { name: "4x" }));
    expect(app.host.session.query.time().speed).toBe(4000);
    expect(screen.getByRole("button", { name: "4x" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "1x" }).getAttribute("aria-pressed")).toBe("false");
  });
});
