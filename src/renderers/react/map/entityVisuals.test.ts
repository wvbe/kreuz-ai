import { describe, expect, it } from "vitest";
import {
  classifyEntity,
  entityColor,
  visualColor,
  visualHeight,
  VisualKind,
  visualKinds,
} from "./entityVisuals";

function entity(prototype: string, components: string[]) {
  return { id: 1, prototype, cell: 0, components };
}

describe("entityVisuals", () => {
  it("classifies by prototype and components", () => {
    expect(classifyEntity(entity("wall", ["Position"]))).toBe(VisualKind.Wall);
    expect(classifyEntity(entity("door", ["Position"]))).toBe(VisualKind.Door);
    expect(classifyEntity(entity("build_site", ["BuildSite", "Position"]))).toBe(
      VisualKind.BuildSite,
    );
    expect(classifyEntity(entity("farmer", ["Citizen", "Needs", "Position"]))).toBe(
      VisualKind.Citizen,
    );
    expect(classifyEntity(entity("trader_caravan", ["Needs", "Trader"]))).toBe(VisualKind.Trader);
    expect(classifyEntity(entity("sheep", ["Animal", "Position"]))).toBe(VisualKind.Livestock);
    expect(classifyEntity(entity("chest", ["Furniture", "Position"]))).toBe(VisualKind.Furniture);
    expect(classifyEntity(entity("job_board", ["JobBoard", "Position"]))).toBe(VisualKind.Marker);
  });

  it("gives every kind a colour and a height", () => {
    for (const kind of visualKinds) {
      expect(visualColor(kind)).toBeGreaterThan(0);
      expect(visualHeight(kind)).toBeGreaterThan(0);
    }
  });

  it("varies citizen colours by prototype deterministically", () => {
    expect(entityColor(VisualKind.Citizen, "farmer")).toBe(
      entityColor(VisualKind.Citizen, "farmer"),
    );
    const colours = new Set(
      ["farmer", "baker", "carpenter", "peasant", "smith"].map((name) =>
        entityColor(VisualKind.Citizen, name),
      ),
    );
    expect(colours.size).toBeGreaterThan(1);
    expect(entityColor(VisualKind.Wall, "wall")).toBe(visualColor(VisualKind.Wall));
  });
});
