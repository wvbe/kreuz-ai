// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Screen } from "../navigation/Screen";
import { renderApp } from "../testing/renderApp";

afterEach(cleanup);

describe("SettingsScreen", () => {
  it("edits the renderer preferences, which stay out of the game", () => {
    const app = renderApp();
    app.start();
    act(() => {
      app.host.navigation.navigate(Screen.Settings);
    });
    const hashBefore = app.host.session.stateHash();
    fireEvent.change(screen.getByLabelText(/Autosave every/), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText(/Toasts per game hour/), { target: { value: "5" } });
    fireEvent.click(screen.getByLabelText("Show zones"));
    fireEvent.click(screen.getByLabelText(/idle and blocked badges/));
    expect(app.host.getPrefs()).toMatchObject({
      autosaveEveryTicks: 50,
      toastBurstLimit: 5,
      showZones: false,
      showBadges: false,
    });
    expect(app.host.session.stateHash()).toBe(hashBefore);
  });
});
