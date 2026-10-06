// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderApp } from "./renderApp";

afterEach(cleanup);

describe("renderApp", () => {
  it("renders the shell without a game on the new-game screen", () => {
    const app = renderApp();
    expect(screen.getByRole("heading", { name: "New game" })).toBeTruthy();
    expect(app.canvas.last).toBeNull();
    expect(app.downloads).toEqual([]);
    app.host.dispose();
  });
});
