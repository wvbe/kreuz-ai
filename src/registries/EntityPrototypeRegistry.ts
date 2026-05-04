import { Registry } from "../engine/Registry.js";
import {
  EntityPrototypeSchema,
  type EntityPrototype,
} from "../schemas/entities.js";
import humanoids from "../data/entities/humanoids.json" with { type: "json" };
import livestock from "../data/entities/livestock.json" with { type: "json" };
import wildAnimals from "../data/entities/wild-animals.json" with { type: "json" };

export function createEntityPrototypeRegistry(): Registry<EntityPrototype> {
  const registry = new Registry<EntityPrototype>();

  const allData = [...humanoids, ...livestock, ...wildAnimals];

  for (const raw of allData) {
    const parsed = EntityPrototypeSchema.parse(raw);
    registry.register(parsed);
  }

  registry.freeze();
  return registry;
}
