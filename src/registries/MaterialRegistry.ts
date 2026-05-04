import { Registry } from "../engine/Registry.js";
import { MaterialSchema, type Material } from "../schemas/materials.js";
import rawResources from "../data/materials/raw-resources.json" with { type: "json" };
import processedGoods from "../data/materials/processed-goods.json" with { type: "json" };
import finishedGoods from "../data/materials/finished-goods.json" with { type: "json" };
import foodAndDrink from "../data/materials/food-and-drink.json" with { type: "json" };
import currency from "../data/materials/currency.json" with { type: "json" };

export function createMaterialRegistry(): Registry<Material> {
  const registry = new Registry<Material>();

  const allData = [
    ...rawResources,
    ...processedGoods,
    ...finishedGoods,
    ...foodAndDrink,
    ...currency,
  ];

  for (const raw of allData) {
    const parsed = MaterialSchema.parse(raw);
    registry.register(parsed);
  }

  registry.freeze();
  return registry;
}
