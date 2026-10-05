import { describe, expect, it } from "vitest";
import { loadContent } from "./ContentLoader";
import { humanoidPrototypeDefinition } from "./humanoidPrototypeDefinition";
import type { HumanoidNeedsContent } from "./humanoidPrototypeDefinition";
import type { ContentRegistries } from "./ContentRegistries";

function needsOf(content: ContentRegistries): HumanoidNeedsContent {
  return { needs: content.needs.all(), startValueMilli: content.constants.needStartValue };
}

describe("humanoidPrototypeDefinition", () => {
  it("builds Position, Inventory, TaskQueue, AiState, Skills, Traits, Citizen, Identity and AI components", () => {
    const content = loadContent();
    const prototype = humanoidPrototypeDefinition(
      content.humanoids.require("baker"),
      content.materials,
      needsOf(content),
    );
    expect(prototype.id).toBe("baker");
    expect(Object.keys(prototype.components).sort()).toEqual([
      "AiState",
      "Citizen",
      "Health",
      "Identity",
      "Inventory",
      "Mood",
      "Needs",
      "Position",
      "Relationships",
      "Skills",
      "TaskQueue",
      "Traits",
    ]);
    expect(prototype.components["Health"]).toEqual({ valueMilli: 100000 });
    expect(prototype.components["Mood"]).toEqual({ valueMilli: 50000, influences: [] });
    expect(prototype.components["Needs"]).toEqual({
      values: [
        { needId: "comfort", valueMilli: 80000 },
        { needId: "faith", valueMilli: 80000 },
        { needId: "hunger", valueMilli: 80000 },
        { needId: "rest", valueMilli: 80000 },
        { needId: "safety", valueMilli: 80000 },
        { needId: "social", valueMilli: 80000 },
      ],
    });
    expect(prototype.components["AiState"]).toEqual({ treeId: "basic_needs" });
    expect(prototype.components["Skills"]).toEqual({ values: { baking: 30000 } });
    expect(prototype.components["Traits"]).toEqual({ ids: ["born_baker"] });
    expect(prototype.components["Citizen"]).toEqual({});
    expect(prototype.components["Identity"]).toEqual({ nameListId: "common_13c" });
  });

  it("stores equipment as stacks with fresh perishables and respects stack limits", () => {
    const content = loadContent();
    const prototype = humanoidPrototypeDefinition(
      content.humanoids.require("baker"),
      content.materials,
      needsOf(content),
    );
    expect(prototype.components["Inventory"]).toEqual({
      slotCount: 8,
      slots: [
        { materialId: "bread", quantity: 2, remainingMilli: 864000, decayRateMilli: 1000 },
        { materialId: "silver_penny", quantity: 20, remainingMilli: null, decayRateMilli: null },
      ],
    });
    const carpenter = humanoidPrototypeDefinition(
      {
        ...content.humanoids.require("carpenter"),
        equipment: [{ materialId: "nails", quantity: 450 }],
      },
      content.materials,
      needsOf(content),
    );
    const slots = carpenter.components["Inventory"]?.["slots"];
    expect(Array.isArray(slots) ? slots.length : 0).toBe(3);
  });
});
