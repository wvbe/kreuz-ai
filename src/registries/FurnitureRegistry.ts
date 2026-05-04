import { Registry } from "../engine/Registry.js";
import { FurnitureSchema, type Furniture } from "../schemas/furniture.js";
import workstations from "../data/furniture/workstations.json" with { type: "json" };
import storage from "../data/furniture/storage.json" with { type: "json" };
import comfortAndLiving from "../data/furniture/comfort-and-living.json" with { type: "json" };
import religious from "../data/furniture/religious.json" with { type: "json" };
import utilityAndDecorative from "../data/furniture/utility-and-decorative.json" with { type: "json" };

export function createFurnitureRegistry(): Registry<Furniture> {
  const registry = new Registry<Furniture>();

  const allData = [
    ...workstations,
    ...storage,
    ...comfortAndLiving,
    ...religious,
    ...utilityAndDecorative,
  ];

  for (const raw of allData) {
    const parsed = FurnitureSchema.parse(raw);
    registry.register(parsed);
  }

  registry.freeze();
  return registry;
}
