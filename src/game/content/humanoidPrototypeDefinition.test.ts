import { describe, expect, it } from "vitest";
import { loadContent } from "./ContentLoader";
import { humanoidPrototypeDefinition } from "./humanoidPrototypeDefinition";

describe("humanoidPrototypeDefinition", () => {
  it("builds Position, Inventory, TaskQueue and AiState components", () => {
    const content = loadContent();
    const prototype = humanoidPrototypeDefinition(
      content.humanoids.require("baker"),
      content.materials,
    );
    expect(prototype.id).toBe("baker");
    expect(Object.keys(prototype.components).sort()).toEqual([
      "AiState",
      "Inventory",
      "Position",
      "TaskQueue",
    ]);
    expect(prototype.components["AiState"]).toEqual({ treeId: "basic_needs" });
  });

  it("stores equipment as stacks with fresh perishables and respects stack limits", () => {
    const content = loadContent();
    const prototype = humanoidPrototypeDefinition(
      content.humanoids.require("baker"),
      content.materials,
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
    );
    const slots = carpenter.components["Inventory"]?.["slots"];
    expect(Array.isArray(slots) ? slots.length : 0).toBe(3);
  });
});
