// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Screen } from "../navigation/Screen";
import { renderApp } from "../testing/renderApp";

afterEach(cleanup);

function openContent() {
  const app = renderApp();
  app.start();
  act(() => {
    app.host.navigation.navigate(Screen.Content);
  });
  return app;
}

describe("ContentScreen", () => {
  it("lists the registries and filters them live as the player types", () => {
    openContent();
    const screenRoot = screen.getByRole("region", { name: "Content browser" });
    expect(within(screenRoot).getByRole("heading", { name: /^Recipes/ })).toBeTruthy();
    expect(within(screenRoot).getByRole("heading", { name: /^Materials/ })).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search content" }), {
      target: { value: "bake_bread" },
    });
    expect(within(screenRoot).getByRole("button", { name: "Bake bread" })).toBeTruthy();
    expect(within(screenRoot).queryByRole("heading", { name: /^Skills/ })).toBeNull();
  });

  it("links a recipe to its inputs and a material back to the recipes that use it", () => {
    openContent();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search content" }), {
      target: { value: "bake_bread" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Bake bread" }));
    const article = screen.getByRole("article", { name: "Bake bread" });
    fireEvent.click(within(article).getByRole("button", { name: "Flour" }));
    const material = screen.getByRole("article", { name: "Flour" });
    expect(within(material).getByText("Used by")).toBeTruthy();
    fireEvent.click(within(material).getByRole("button", { name: "Bake bread" }));
    expect(screen.getByRole("article", { name: "Bake bread" })).toBeTruthy();
    expect(
      within(screen.getByRole("article", { name: "Bake bread" })).getByRole("button", {
        name: "Oven",
      }),
    ).toBeTruthy();
  });

  it("marks furniture that a later tier unlocks", () => {
    openContent();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search content" }), {
      target: { value: "forge" },
    });
    expect(screen.getAllByText(/Unlocks at Village/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Forge" }));
    const article = screen.getByRole("article", { name: "Forge" });
    expect(within(article).getByText(/Unlocks at Village/)).toBeTruthy();
  });
});
