// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderApp } from "../testing/renderApp";

afterEach(cleanup);

describe("ToastSettings", () => {
  // @covers 024:FR-028 025:FR-019
  it("toggles the toast of a reason kind in the settings", () => {
    const app = renderApp();
    app.start();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const box = (): HTMLInputElement =>
      screen.getByRole("checkbox", { name: "Missing input" }) as HTMLInputElement;
    expect(box().checked).toBe(true);
    fireEvent.click(box());
    expect(app.host.getPrefs().mutedBlockedReasons).toEqual(["MissingInput"]);
    expect(box().checked).toBe(false);
    fireEvent.click(box());
    expect(app.host.getPrefs().mutedBlockedReasons).toEqual([]);
  });
});
