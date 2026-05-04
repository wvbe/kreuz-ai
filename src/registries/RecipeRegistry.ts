import { Registry } from '../engine/Registry.js';
import { RecipeSchema, type Recipe } from '../schemas/recipes.js';
import woodProcessing from '../data/recipes/wood-processing.json' with { type: 'json' };
import metalProcessing from '../data/recipes/metal-processing.json' with { type: 'json' };
import toolsAndEquipment from '../data/recipes/tools-and-equipment.json' with { type: 'json' };
import weaponsAndArmor from '../data/recipes/weapons-and-armor.json' with { type: 'json' };
import textiles from '../data/recipes/textiles.json' with { type: 'json' };
import leatherProcessing from '../data/recipes/leather-processing.json' with { type: 'json' };
import stonework from '../data/recipes/stonework.json' with { type: 'json' };
import foodAndDrink from '../data/recipes/food-and-drink.json' with { type: 'json' };
import miscellaneous from '../data/recipes/miscellaneous.json' with { type: 'json' };

export function createRecipeRegistry(): Registry<Recipe> {
  const registry = new Registry<Recipe>();

  const allData = [
    ...woodProcessing,
    ...metalProcessing,
    ...toolsAndEquipment,
    ...weaponsAndArmor,
    ...textiles,
    ...leatherProcessing,
    ...stonework,
    ...foodAndDrink,
    ...miscellaneous,
  ];

  for (const raw of allData) {
    const parsed = RecipeSchema.parse(raw);
    registry.register(parsed);
  }

  registry.freeze();
  return registry;
}
