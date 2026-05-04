import { Registry } from "../engine/Registry.js";
import { TraitSchema, type Trait } from "../schemas/traits.js";
import traitsData from "../data/traits.json" with { type: "json" };

export function createTraitRegistry(): Registry<Trait> {
  const registry = new Registry<Trait>();

  for (const raw of traitsData) {
    const parsed = TraitSchema.parse(raw);
    registry.register(parsed);
  }

  registry.freeze();
  return registry;
}
