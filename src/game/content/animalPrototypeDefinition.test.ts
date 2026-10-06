import { describe, expect, it } from "vitest";
import { AnimalKind } from "./contentTypes";
import { animalInventorySlots, animalPrototypeDefinition } from "./animalPrototypeDefinition";
import { animalPrototypeSchema } from "./schemas/characterSchemas";

describe("animalPrototypeDefinition", () => {
  const deer = animalPrototypeSchema.parse({
    id: "deer",
    name: "Deer",
    kind: AnimalKind.Wild,
    behaviorTreeId: "prey_behavior",
  });

  it("builds an animal without the citizen components", () => {
    const definition = animalPrototypeDefinition(deer);
    expect(definition.id).toBe("deer");
    expect(Object.keys(definition.components).sort()).toEqual([
      "AiState",
      "Animal",
      "Health",
      "Inventory",
      "Position",
      "TaskQueue",
    ]);
    expect(definition.components["AiState"]).toEqual({ treeId: "prey_behavior" });
    expect(definition.components["Inventory"]).toMatchObject({ slotCount: animalInventorySlots });
    expect(definition.components["Animal"]).toMatchObject({
      prototypeId: "deer",
      kind: "wild",
    });
  });
});
