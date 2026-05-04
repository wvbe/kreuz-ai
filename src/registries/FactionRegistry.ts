import { Registry } from "../engine/Registry.js";
import { FactionSchema, type Faction } from "../schemas/factions.js";
import guilds from "../data/factions/guilds.json" with { type: "json" };
import religious from "../data/factions/religious.json" with { type: "json" };

export function createFactionRegistry(): Registry<Faction> {
  const registry = new Registry<Faction>();

  const allData = [...guilds, ...religious];

  for (const raw of allData) {
    const parsed = FactionSchema.parse(raw);
    registry.register(parsed);
  }

  registry.freeze();
  return registry;
}
