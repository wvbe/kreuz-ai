// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Screen } from "../navigation/Screen";
import { renderApp } from "../testing/renderApp";
import { GovernmentTab } from "./GovernmentScreen";

afterEach(cleanup);

describe("GovernmentScreen", () => {
  it("is the Government entry of the shell and opens on the job boards", () => {
    const app = renderApp();
    app.start();
    fireEvent.click(screen.getByRole("button", { name: "Government" }));
    expect(app.host.navigation.getSnapshot().screen).toBe(Screen.StandingOrders);
    expect(
      screen.getByRole("tab", { name: GovernmentTab.Boards }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByText(/Board #\d+/)).toBeTruthy();
  });

  it("switches between every tab", () => {
    const app = renderApp();
    app.start();
    act(() => {
      app.host.navigation.navigate(Screen.StandingOrders);
    });
    for (const tab of Object.values(GovernmentTab)) {
      fireEvent.click(screen.getByRole("tab", { name: tab }));
      expect(screen.getByRole("tab", { name: tab }).getAttribute("aria-selected")).toBe("true");
      expect(screen.getByRole("tabpanel").textContent).not.toBe("");
    }
  });
});
