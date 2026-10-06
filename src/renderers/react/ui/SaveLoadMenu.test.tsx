// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Screen } from "../navigation/Screen";
import { renderApp } from "../testing/renderApp";

afterEach(cleanup);

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe("SaveLoadMenu", () => {
  it("offers the save as a JSON file download named after the day and tick", () => {
    const app = renderApp();
    app.start();
    act(() => {
      app.host.step(5);
      app.host.navigation.navigate(Screen.Settings);
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to file" }));
    expect(app.downloads).toHaveLength(1);
    expect(app.downloads[0]?.fileName).toBe("kreuzvibe-day0-tick5.json");
    expect(() => JSON.parse(app.downloads[0]?.text ?? "")).not.toThrow();
  });

  it("loads a game back from a picked file, restoring the saved tick", async () => {
    const app = renderApp();
    app.start();
    act(() => {
      app.host.step(4);
    });
    const text = app.host.saveText() ?? "";
    act(() => {
      app.host.step(6);
      app.host.navigation.navigate(Screen.Settings);
    });
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    const file = new File([text], "save.json", { type: "application/json" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(app.host.session.tick).toBe(4));
  });

  it("disables saving without a game and loads the autosave slot when present", () => {
    const storage = memoryStorage();
    const app = renderApp({ storage });
    act(() => {
      app.host.navigation.navigate(Screen.Settings);
    });
    expect(
      (screen.getByRole("button", { name: "Save to file" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Load autosave" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
