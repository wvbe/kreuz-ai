import { Registry } from '../engine/Registry.js';
import { ZoneTypeSchema, type ZoneType } from '../schemas/zones.js';
import production from '../data/zones/production.json' with { type: 'json' };
import storageAndUtility from '../data/zones/storage-and-utility.json' with { type: 'json' };
import livingAndSocial from '../data/zones/living-and-social.json' with { type: 'json' };
import religious from '../data/zones/religious.json' with { type: 'json' };
import military from '../data/zones/military.json' with { type: 'json' };
import openAir from '../data/zones/open-air.json' with { type: 'json' };

export function createZoneTypeRegistry(): Registry<ZoneType> {
  const registry = new Registry<ZoneType>();

  const allData = [
    ...production,
    ...storageAndUtility,
    ...livingAndSocial,
    ...religious,
    ...military,
    ...openAir,
  ];

  for (const raw of allData) {
    const parsed = ZoneTypeSchema.parse(raw);
    registry.register(parsed);
  }

  registry.freeze();
  return registry;
}
