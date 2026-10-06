// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ContentKind } from "../../../game/api/contentQueries";
import { Screen } from "../navigation/Screen";
import { openContentEntry } from "./contentRequests";
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
  // @covers 024:FR-017 024:FR-018
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

  // @covers 024:FR-019
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

  // @covers 024:FR-035
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

  // @covers 024:FR-030
  it("offers Keep in stock on a material and a recipe card and opens the form prefilled", () => {
    const app = openContent();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search content" }), {
      target: { value: "bake_bread" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Bake bread" }));
    const recipe = screen.getByRole("article", { name: "Bake bread" });
    fireEvent.click(within(recipe).getByRole("button", { name: "Keep bread in stock" }));
    expect(app.host.navigation.getSnapshot().screen).toBe(Screen.StandingOrders);
    const form = screen.getByRole("form", { name: "Keep in stock" });
    expect((within(form).getByLabelText("Material") as HTMLInputElement).value).toBe("bread");
  });

  // @covers 024:FR-017 024:FR-018 024:SC-005
  it("searches the 13 registries at once within 200 ms", () => {
    openContent();
    const root = screen.getByRole("region", { name: "Content browser" });
    for (const label of [/^Materials/, /^Skills/, /^Needs/, /^Terrain/, /^Traits/, /^Furniture/]) {
      expect(within(root).getByRole("heading", { name: label })).toBeTruthy();
    }
    for (const label of [/^Zone types/, /^Factions/, /^Jobs/, /^Recipes/, /^Behaviors/]) {
      expect(within(root).getByRole("heading", { name: label })).toBeTruthy();
    }
    expect(within(root).getByRole("heading", { name: /^Humanoids/ })).toBeTruthy();
    expect(within(root).getByRole("heading", { name: /^Animals/ })).toBeTruthy();
    expect(within(root).getByRole("heading", { name: /^Name lists/ })).toBeTruthy();
    const started = performance.now();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search content" }), {
      target: { value: "bak" },
    });
    expect(performance.now() - started).toBeLessThan(200);
    // one query, hits in several registries: the baker humanoid, the baking skill, the guild
    expect(within(root).getByRole("heading", { name: /^Humanoids/ })).toBeTruthy();
    expect(within(root).getByRole("heading", { name: /^Skills/ })).toBeTruthy();
    expect(within(root).getByRole("heading", { name: /^Factions/ })).toBeTruthy();
  });

  // @covers 024:FR-019 024:SC-002
  it("opens on the entry another screen links to", () => {
    const app = renderApp();
    app.start();
    act(() => {
      openContentEntry(app.host, ContentKind.Recipe, "bake_bread");
    });
    expect(screen.getByRole("article", { name: "Bake bread" })).toBeTruthy();
  });
});
