// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderApp } from "../testing/renderApp";
import { sidePanels } from "./sidePanels";

afterEach(cleanup);

describe("SelectionDock", () => {
  it("renders every registered side panel beside the map", () => {
    const app = renderApp();
    app.start();
    const dock = screen.getByRole("complementary", { name: "Panels" });
    for (const panel of sidePanels) {
      expect(dock.querySelector(`[data-panel="${panel.id}"]`)).not.toBeNull();
    }
    expect(screen.getByText("Nothing selected.")).toBeTruthy();
  });
});
