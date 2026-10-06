import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { MapSize } from "../map/mapSize";
import { ContentKind, buildContentEntryView, buildContentRegistriesView } from "./contentQueries";
import type { ContentEntryView, ContentRegistriesView } from "./contentQueries";
import { GameSession } from "./GameSession";

function session(): GameSession {
  const started = new GameSession(loadContent(), { entropy: () => 7 });
  started.newGame({ seed: 10, mapSize: MapSize.Small });
  return started;
}

function entry(started: GameSession, kind: ContentKind, id: string): ContentEntryView | null {
  const result = started.query.run("content-entry", { kind, id });
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  // eslint-disable-next-line no-restricted-syntax -- JSON to the documented view type of the query
  return result.data as unknown as ContentEntryView | null;
}

describe("content queries", () => {
  it("lists every category with entries", () => {
    const result = session().query.run("content-registries", {});
    expect(result.ok).toBe(true);
    // eslint-disable-next-line no-restricted-syntax -- JSON to the documented view type of the query
    const view = (result.ok ? result.data : null) as unknown as ContentRegistriesView;
    expect(view.categories.map((category) => category.kind)).toEqual(Object.values(ContentKind));
    const recipes = view.categories.find((category) => category.kind === ContentKind.Recipe);
    expect(recipes?.entries.length).toBeGreaterThan(3);
    const locked = view.categories
      .flatMap((category) => category.entries)
      .filter((row) => row.unlockTier !== null);
    expect(locked.length).toBeGreaterThan(0);
  });

  it("links a recipe to its materials and its workstation, and back", () => {
    const started = session();
    const bread = entry(started, ContentKind.Recipe, "bake_bread");
    expect(bread).not.toBeNull();
    const inputs = bread?.links.filter((link) => link.role === "input") ?? [];
    expect(inputs.length).toBeGreaterThan(0);
    expect(bread?.links.some((link) => link.kind === ContentKind.Furniture)).toBe(true);
    const flour = entry(started, ContentKind.Material, inputs[0]?.id ?? "");
    expect(
      flour?.usedBy.some((link) => link.kind === ContentKind.Recipe && link.id === "bake_bread"),
    ).toBe(true);
    const oven = entry(started, ContentKind.Furniture, "oven");
    expect(
      oven?.usedBy.some((link) => link.id === "bake_bread" && link.role === "workstation"),
    ).toBe(true);
  });

  it("answers null for an unknown entry and rejects an unknown kind", () => {
    const started = session();
    expect(entry(started, ContentKind.Material, "no_such_material")).toBeNull();
    expect(started.query.run("content-entry", { kind: "nonsense", id: "x" }).ok).toBe(false);
  });

  it("builds the views straight from the content registries", () => {
    const content = loadContent();
    const registries = buildContentRegistriesView(content);
    expect(
      registries.categories.find((category) => category.kind === ContentKind.Terrain)?.entries
        .length,
    ).toBeGreaterThan(3);
    const grass = buildContentEntryView(content, ContentKind.Terrain, "grassland");
    expect(grass?.fields["buildable"]).toBe(true);
    expect(buildContentEntryView(content, ContentKind.Recipe, "no_such_recipe")).toBeNull();
  });
});
