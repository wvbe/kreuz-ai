/**
 * Content loader: loads and validates all game content into registries.
 * Creates a complete set of registries from inline data (no external JSON files needed for now).
 */

import { createRegistry, registerEntry, type Registry, type ContentEntry } from "./Registry.js";

export type MaterialEntry = ContentEntry & {
  category: string;
  weight: number;
  value: number;
  stackSize: number;
};

export type RecipeEntry = ContentEntry & {
  inputs: Array<{ materialId: string; quantity: number }>;
  outputs: Array<{ materialId: string; quantity: number }>;
  requiredSkill: string;
  requiredLevel: number;
  workRequired: number;
  stationType: string;
};

export type FurnitureEntry = ContentEntry & {
  category: string;
  materials: Array<{ materialId: string; quantity: number }>;
  workRequired: number;
  providesZoneFunction?: string;
};

export type ZoneTypeEntry = ContentEntry & {
  category: string;
  requiredFurniture: string[];
  maxWorkers: number;
};

export type SkillEntry = ContentEntry & {
  category: string;
  baseExpRate: number;
};

export type NeedEntry = ContentEntry & {
  decayRate: number;
  urgencyThreshold: number;
  criticalThreshold: number;
};

export type TerrainEntry = ContentEntry & {
  color: string;
  walkable: boolean;
  movementCost: number;
};

export type TraitEntry = ContentEntry & {
  category: string;
  effects: Array<{ targetStat: string; modifier: number; isMultiplier: boolean }>;
};

export type FactionEntry = ContentEntry & {
  category: string;
  initialDisposition: number;
};

export type EntityPrototypeEntry = ContentEntry & {
  category: string;
  components: Record<string, unknown>;
  tags: string[];
};

export type ContentRegistries = {
  materials: Registry<MaterialEntry>;
  recipes: Registry<RecipeEntry>;
  furniture: Registry<FurnitureEntry>;
  zoneTypes: Registry<ZoneTypeEntry>;
  skills: Registry<SkillEntry>;
  needs: Registry<NeedEntry>;
  terrain: Registry<TerrainEntry>;
  traits: Registry<TraitEntry>;
  factions: Registry<FactionEntry>;
  entityPrototypes: Registry<EntityPrototypeEntry>;
};

/**
 * Loads all content registries with game data.
 */
export function loadAllContent(): ContentRegistries {
  const registries: ContentRegistries = {
    materials: createRegistry<MaterialEntry>("materials"),
    recipes: createRegistry<RecipeEntry>("recipes"),
    furniture: createRegistry<FurnitureEntry>("furniture"),
    zoneTypes: createRegistry<ZoneTypeEntry>("zoneTypes"),
    skills: createRegistry<SkillEntry>("skills"),
    needs: createRegistry<NeedEntry>("needs"),
    terrain: createRegistry<TerrainEntry>("terrain"),
    traits: createRegistry<TraitEntry>("traits"),
    factions: createRegistry<FactionEntry>("factions"),
    entityPrototypes: createRegistry<EntityPrototypeEntry>("entityPrototypes"),
  };

  loadMaterials(registries.materials);
  loadRecipes(registries.recipes);
  loadFurniture(registries.furniture);
  loadZoneTypes(registries.zoneTypes);
  loadSkills(registries.skills);
  loadNeeds(registries.needs);
  loadTerrain(registries.terrain);
  loadTraits(registries.traits);
  loadFactions(registries.factions);
  loadEntityPrototypes(registries.entityPrototypes);

  return registries;
}

function loadMaterials(registry: Registry<MaterialEntry>): void {
  const materials: MaterialEntry[] = [
    { id: "wood", name: "Wood", category: "raw", weight: 2, value: 3, stackSize: 50, description: "Lumber from felled trees" },
    { id: "stone", name: "Stone", category: "raw", weight: 5, value: 2, stackSize: 30, description: "Quarried stone blocks" },
    { id: "iron_ore", name: "Iron Ore", category: "raw", weight: 4, value: 5, stackSize: 30, description: "Raw iron from mines" },
    { id: "clay", name: "Clay", category: "raw", weight: 3, value: 1, stackSize: 40, description: "Potter's clay" },
    { id: "wool", name: "Wool", category: "raw", weight: 1, value: 4, stackSize: 40, description: "Sheep's wool" },
    { id: "flax", name: "Flax", category: "raw", weight: 1, value: 3, stackSize: 50, description: "Raw flax fiber" },
    { id: "wheat", name: "Wheat", category: "food_raw", weight: 1, value: 2, stackSize: 100, description: "Harvested wheat grain" },
    { id: "barley", name: "Barley", category: "food_raw", weight: 1, value: 2, stackSize: 100, description: "Malting barley" },
    { id: "meat_raw", name: "Raw Meat", category: "food_raw", weight: 2, value: 4, stackSize: 20, description: "Uncooked game meat" },
    { id: "herbs", name: "Herbs", category: "food_raw", weight: 0.5, value: 3, stackSize: 50, description: "Medicinal and culinary herbs" },
    { id: "leather", name: "Leather", category: "processed", weight: 2, value: 8, stackSize: 30, description: "Tanned animal hide" },
    { id: "iron_ingot", name: "Iron Ingot", category: "processed", weight: 3, value: 12, stackSize: 20, description: "Smelted iron bar" },
    { id: "planks", name: "Planks", category: "processed", weight: 2, value: 6, stackSize: 40, description: "Sawn timber boards" },
    { id: "linen", name: "Linen Cloth", category: "processed", weight: 1, value: 10, stackSize: 30, description: "Woven linen fabric" },
    { id: "flour", name: "Flour", category: "processed", weight: 1, value: 4, stackSize: 50, description: "Milled wheat flour" },
    { id: "bread", name: "Bread", category: "food", weight: 1, value: 6, stackSize: 30, description: "Fresh baked loaf" },
    { id: "ale", name: "Ale", category: "food", weight: 2, value: 5, stackSize: 20, description: "Brewed barley ale" },
    { id: "meat_cooked", name: "Cooked Meat", category: "food", weight: 2, value: 8, stackSize: 20, description: "Roasted meat" },
    { id: "stew", name: "Stew", category: "food", weight: 2, value: 7, stackSize: 15, description: "Hearty meat and vegetable stew" },
    { id: "iron_tools", name: "Iron Tools", category: "finished", weight: 3, value: 20, stackSize: 10, description: "Set of iron tools" },
    { id: "iron_sword", name: "Iron Sword", category: "finished", weight: 3, value: 30, stackSize: 5, description: "Forged iron blade" },
    { id: "iron_armor", name: "Iron Armor", category: "finished", weight: 10, value: 50, stackSize: 3, description: "Iron chainmail" },
    { id: "pottery", name: "Pottery", category: "finished", weight: 2, value: 8, stackSize: 15, description: "Fired clay vessels" },
    { id: "candles", name: "Candles", category: "finished", weight: 0.5, value: 5, stackSize: 30, description: "Tallow candles" },
    { id: "gold_coin", name: "Gold Coin", category: "currency", weight: 0.1, value: 1, stackSize: 999, description: "Standard currency" },
    { id: "silver_coin", name: "Silver Coin", category: "currency", weight: 0.1, value: 0.1, stackSize: 999, description: "Minor currency" },
    { id: "glass", name: "Glass", category: "processed", weight: 2, value: 15, stackSize: 20, description: "Blown glass" },
    { id: "charcoal", name: "Charcoal", category: "processed", weight: 1, value: 4, stackSize: 40, description: "Burnt wood fuel" },
    { id: "rope", name: "Rope", category: "processed", weight: 1, value: 6, stackSize: 30, description: "Twisted hemp rope" },
    { id: "nails", name: "Nails", category: "processed", weight: 0.5, value: 3, stackSize: 100, description: "Iron nails" },
  ];
  for (const material of materials) registerEntry(registry, material);
}

function loadRecipes(registry: Registry<RecipeEntry>): void {
  const recipes: RecipeEntry[] = [
    { id: "saw_planks", name: "Saw Planks", description: "Cut logs into planks", inputs: [{ materialId: "wood", quantity: 2 }], outputs: [{ materialId: "planks", quantity: 3 }], requiredSkill: "carpentry", requiredLevel: 1, workRequired: 30, stationType: "sawmill" },
    { id: "smelt_iron", name: "Smelt Iron", description: "Smelt ore into ingots", inputs: [{ materialId: "iron_ore", quantity: 2 }, { materialId: "charcoal", quantity: 1 }], outputs: [{ materialId: "iron_ingot", quantity: 1 }], requiredSkill: "smithing", requiredLevel: 1, workRequired: 50, stationType: "forge" },
    { id: "forge_tools", name: "Forge Tools", description: "Forge iron tools", inputs: [{ materialId: "iron_ingot", quantity: 2 }], outputs: [{ materialId: "iron_tools", quantity: 1 }], requiredSkill: "smithing", requiredLevel: 2, workRequired: 80, stationType: "forge" },
    { id: "forge_sword", name: "Forge Sword", description: "Forge an iron sword", inputs: [{ materialId: "iron_ingot", quantity: 3 }], outputs: [{ materialId: "iron_sword", quantity: 1 }], requiredSkill: "smithing", requiredLevel: 3, workRequired: 100, stationType: "forge" },
    { id: "forge_armor", name: "Forge Armor", description: "Forge iron chainmail", inputs: [{ materialId: "iron_ingot", quantity: 5 }], outputs: [{ materialId: "iron_armor", quantity: 1 }], requiredSkill: "smithing", requiredLevel: 4, workRequired: 150, stationType: "forge" },
    { id: "mill_flour", name: "Mill Flour", description: "Grind wheat into flour", inputs: [{ materialId: "wheat", quantity: 3 }], outputs: [{ materialId: "flour", quantity: 2 }], requiredSkill: "cooking", requiredLevel: 1, workRequired: 20, stationType: "mill" },
    { id: "bake_bread", name: "Bake Bread", description: "Bake bread from flour", inputs: [{ materialId: "flour", quantity: 2 }], outputs: [{ materialId: "bread", quantity: 3 }], requiredSkill: "cooking", requiredLevel: 1, workRequired: 40, stationType: "bakery" },
    { id: "brew_ale", name: "Brew Ale", description: "Brew barley ale", inputs: [{ materialId: "barley", quantity: 3 }], outputs: [{ materialId: "ale", quantity: 2 }], requiredSkill: "cooking", requiredLevel: 2, workRequired: 60, stationType: "brewery" },
    { id: "cook_meat", name: "Cook Meat", description: "Roast raw meat", inputs: [{ materialId: "meat_raw", quantity: 1 }], outputs: [{ materialId: "meat_cooked", quantity: 1 }], requiredSkill: "cooking", requiredLevel: 1, workRequired: 25, stationType: "kitchen" },
    { id: "make_stew", name: "Make Stew", description: "Cook a hearty stew", inputs: [{ materialId: "meat_raw", quantity: 1 }, { materialId: "herbs", quantity: 1 }], outputs: [{ materialId: "stew", quantity: 2 }], requiredSkill: "cooking", requiredLevel: 2, workRequired: 45, stationType: "kitchen" },
    { id: "tan_leather", name: "Tan Leather", description: "Tan hides into leather", inputs: [{ materialId: "meat_raw", quantity: 2 }], outputs: [{ materialId: "leather", quantity: 1 }], requiredSkill: "tanning", requiredLevel: 1, workRequired: 60, stationType: "tannery" },
    { id: "weave_linen", name: "Weave Linen", description: "Weave flax into linen", inputs: [{ materialId: "flax", quantity: 3 }], outputs: [{ materialId: "linen", quantity: 1 }], requiredSkill: "weaving", requiredLevel: 1, workRequired: 50, stationType: "loom" },
    { id: "make_pottery", name: "Make Pottery", description: "Shape and fire clay", inputs: [{ materialId: "clay", quantity: 2 }], outputs: [{ materialId: "pottery", quantity: 1 }], requiredSkill: "crafting", requiredLevel: 1, workRequired: 40, stationType: "kiln" },
    { id: "make_charcoal", name: "Make Charcoal", description: "Burn wood to charcoal", inputs: [{ materialId: "wood", quantity: 3 }], outputs: [{ materialId: "charcoal", quantity: 2 }], requiredSkill: "crafting", requiredLevel: 1, workRequired: 35, stationType: "charcoal_pit" },
    { id: "make_nails", name: "Make Nails", description: "Forge iron nails", inputs: [{ materialId: "iron_ingot", quantity: 1 }], outputs: [{ materialId: "nails", quantity: 20 }], requiredSkill: "smithing", requiredLevel: 1, workRequired: 25, stationType: "forge" },
    { id: "make_rope", name: "Make Rope", description: "Twist hemp into rope", inputs: [{ materialId: "flax", quantity: 2 }], outputs: [{ materialId: "rope", quantity: 2 }], requiredSkill: "crafting", requiredLevel: 1, workRequired: 20, stationType: "ropemaker" },
    { id: "blow_glass", name: "Blow Glass", description: "Form molten glass", inputs: [{ materialId: "clay", quantity: 1 }, { materialId: "charcoal", quantity: 2 }], outputs: [{ materialId: "glass", quantity: 1 }], requiredSkill: "crafting", requiredLevel: 3, workRequired: 60, stationType: "glassworks" },
    { id: "make_candles", name: "Make Candles", description: "Dip tallow candles", inputs: [{ materialId: "meat_raw", quantity: 1 }], outputs: [{ materialId: "candles", quantity: 4 }], requiredSkill: "crafting", requiredLevel: 1, workRequired: 15, stationType: "chandlery" },
  ];
  for (const recipe of recipes) registerEntry(registry, recipe);
}

function loadFurniture(registry: Registry<FurnitureEntry>): void {
  const furniture: FurnitureEntry[] = [
    { id: "forge", name: "Forge", category: "workstation", description: "For smelting and smithing", materials: [{ materialId: "stone", quantity: 10 }, { materialId: "iron_ingot", quantity: 3 }], workRequired: 100, providesZoneFunction: "smithing" },
    { id: "anvil", name: "Anvil", category: "workstation", description: "Iron anvil for metalwork", materials: [{ materialId: "iron_ingot", quantity: 5 }], workRequired: 80 },
    { id: "sawmill", name: "Sawmill", category: "workstation", description: "Sawing logs to planks", materials: [{ materialId: "wood", quantity: 8 }, { materialId: "iron_tools", quantity: 1 }], workRequired: 60, providesZoneFunction: "carpentry" },
    { id: "loom", name: "Loom", category: "workstation", description: "Weaving cloth", materials: [{ materialId: "wood", quantity: 6 }], workRequired: 50, providesZoneFunction: "weaving" },
    { id: "kiln", name: "Kiln", category: "workstation", description: "Firing pottery and bricks", materials: [{ materialId: "stone", quantity: 8 }, { materialId: "clay", quantity: 4 }], workRequired: 70, providesZoneFunction: "pottery" },
    { id: "bakery_oven", name: "Bakery Oven", category: "workstation", description: "Baking bread and pies", materials: [{ materialId: "stone", quantity: 6 }, { materialId: "clay", quantity: 3 }], workRequired: 60, providesZoneFunction: "baking" },
    { id: "brewery_vat", name: "Brewery Vat", category: "workstation", description: "Brewing ales and meads", materials: [{ materialId: "wood", quantity: 6 }, { materialId: "iron_ingot", quantity: 1 }], workRequired: 50, providesZoneFunction: "brewing" },
    { id: "bed", name: "Bed", category: "comfort", description: "Simple wooden bed", materials: [{ materialId: "planks", quantity: 4 }, { materialId: "wool", quantity: 2 }], workRequired: 30 },
    { id: "chair", name: "Chair", category: "comfort", description: "Wooden chair", materials: [{ materialId: "planks", quantity: 2 }], workRequired: 15 },
    { id: "table", name: "Table", category: "comfort", description: "Dining table", materials: [{ materialId: "planks", quantity: 4 }], workRequired: 25 },
    { id: "chest", name: "Storage Chest", category: "storage", description: "Wooden storage chest", materials: [{ materialId: "planks", quantity: 3 }, { materialId: "nails", quantity: 6 }], workRequired: 20 },
    { id: "barrel", name: "Barrel", category: "storage", description: "Wooden barrel for liquids", materials: [{ materialId: "planks", quantity: 4 }, { materialId: "rope", quantity: 1 }], workRequired: 25 },
    { id: "altar", name: "Altar", category: "religious", description: "Stone altar for worship", materials: [{ materialId: "stone", quantity: 8 }], workRequired: 80 },
    { id: "torch", name: "Wall Torch", category: "utility", description: "Iron wall sconce with torch", materials: [{ materialId: "iron_ingot", quantity: 1 }], workRequired: 10 },
    { id: "well", name: "Well", category: "utility", description: "Water well", materials: [{ materialId: "stone", quantity: 12 }, { materialId: "rope", quantity: 2 }], workRequired: 100 },
  ];
  for (const entry of furniture) registerEntry(registry, entry);
}

function loadZoneTypes(registry: Registry<ZoneTypeEntry>): void {
  const zones: ZoneTypeEntry[] = [
    { id: "smithy", name: "Smithy", category: "production", description: "Metalworking workshop", requiredFurniture: ["forge", "anvil"], maxWorkers: 2 },
    { id: "carpentry_workshop", name: "Carpentry Workshop", category: "production", description: "Woodworking shop", requiredFurniture: ["sawmill"], maxWorkers: 2 },
    { id: "bakery", name: "Bakery", category: "production", description: "Bread baking zone", requiredFurniture: ["bakery_oven"], maxWorkers: 2 },
    { id: "brewery", name: "Brewery", category: "production", description: "Ale brewing zone", requiredFurniture: ["brewery_vat"], maxWorkers: 1 },
    { id: "weaving_house", name: "Weaving House", category: "production", description: "Cloth production", requiredFurniture: ["loom"], maxWorkers: 2 },
    { id: "kitchen", name: "Kitchen", category: "production", description: "Cooking meals", requiredFurniture: ["bakery_oven"], maxWorkers: 2 },
    { id: "stockpile", name: "Stockpile", category: "storage", description: "General goods storage", requiredFurniture: [], maxWorkers: 0 },
    { id: "food_store", name: "Food Store", category: "storage", description: "Perishable food storage", requiredFurniture: ["barrel"], maxWorkers: 0 },
    { id: "dormitory", name: "Dormitory", category: "living", description: "Shared sleeping quarters", requiredFurniture: ["bed"], maxWorkers: 0 },
    { id: "dining_hall", name: "Dining Hall", category: "living", description: "Communal eating area", requiredFurniture: ["table", "chair"], maxWorkers: 0 },
    { id: "chapel", name: "Chapel", category: "religious", description: "Place of worship", requiredFurniture: ["altar"], maxWorkers: 1 },
    { id: "barracks", name: "Barracks", category: "military", description: "Guard quarters and training", requiredFurniture: ["bed"], maxWorkers: 4 },
    { id: "market_stall", name: "Market Stall", category: "trade", description: "Trading post", requiredFurniture: ["chest"], maxWorkers: 1 },
    { id: "farm_field", name: "Farm Field", category: "production", description: "Crop growing area", requiredFurniture: [], maxWorkers: 3 },
  ];
  for (const zone of zones) registerEntry(registry, zone);
}

function loadSkills(registry: Registry<SkillEntry>): void {
  const skills: SkillEntry[] = [
    { id: "smithing", name: "Smithing", category: "craft", description: "Metalworking skill", baseExpRate: 1.0 },
    { id: "carpentry", name: "Carpentry", category: "craft", description: "Woodworking skill", baseExpRate: 1.0 },
    { id: "cooking", name: "Cooking", category: "craft", description: "Food preparation", baseExpRate: 1.2 },
    { id: "weaving", name: "Weaving", category: "craft", description: "Textile production", baseExpRate: 1.0 },
    { id: "tanning", name: "Tanning", category: "craft", description: "Leather working", baseExpRate: 0.8 },
    { id: "crafting", name: "General Crafting", category: "craft", description: "General handcraft", baseExpRate: 1.1 },
    { id: "mining", name: "Mining", category: "labor", description: "Stone and ore extraction", baseExpRate: 0.8 },
    { id: "farming", name: "Farming", category: "labor", description: "Crop cultivation", baseExpRate: 1.0 },
    { id: "woodcutting", name: "Woodcutting", category: "labor", description: "Tree felling", baseExpRate: 0.9 },
    { id: "hauling", name: "Hauling", category: "labor", description: "Material transport", baseExpRate: 1.5 },
    { id: "combat", name: "Combat", category: "military", description: "Fighting proficiency", baseExpRate: 0.7 },
    { id: "medicine", name: "Medicine", category: "knowledge", description: "Healing arts", baseExpRate: 0.6 },
    { id: "trading", name: "Trading", category: "social", description: "Commerce negotiation", baseExpRate: 0.8 },
    { id: "leadership", name: "Leadership", category: "social", description: "Organizing and inspiring", baseExpRate: 0.5 },
    { id: "construction", name: "Construction", category: "labor", description: "Building structures", baseExpRate: 1.0 },
  ];
  for (const skill of skills) registerEntry(registry, skill);
}

function loadNeeds(registry: Registry<NeedEntry>): void {
  const needs: NeedEntry[] = [
    { id: "hunger", name: "Hunger", description: "Need for food", decayRate: 0.002, urgencyThreshold: 0.3, criticalThreshold: 0.1 },
    { id: "thirst", name: "Thirst", description: "Need for water", decayRate: 0.003, urgencyThreshold: 0.3, criticalThreshold: 0.1 },
    { id: "rest", name: "Rest", description: "Need for sleep", decayRate: 0.001, urgencyThreshold: 0.25, criticalThreshold: 0.05 },
    { id: "social", name: "Social", description: "Need for interaction", decayRate: 0.0005, urgencyThreshold: 0.2, criticalThreshold: 0.05 },
    { id: "comfort", name: "Comfort", description: "Need for comfort", decayRate: 0.0008, urgencyThreshold: 0.2, criticalThreshold: 0.05 },
    { id: "spiritual", name: "Spiritual", description: "Need for worship", decayRate: 0.0003, urgencyThreshold: 0.15, criticalThreshold: 0.03 },
  ];
  for (const need of needs) registerEntry(registry, need);
}

function loadTerrain(registry: Registry<TerrainEntry>): void {
  const terrains: TerrainEntry[] = [
    { id: "grassland", name: "Grassland", color: "#7ec850", walkable: true, movementCost: 1.0 },
    { id: "forest", name: "Forest", color: "#2d6b1e", walkable: true, movementCost: 1.5 },
    { id: "mountain", name: "Mountain", color: "#8b7355", walkable: false, movementCost: 99 },
    { id: "water", name: "Water", color: "#4488cc", walkable: false, movementCost: 99 },
    { id: "deep_water", name: "Deep Water", color: "#224488", walkable: false, movementCost: 99 },
    { id: "desert", name: "Desert", color: "#e8d68a", walkable: true, movementCost: 1.3 },
    { id: "marsh", name: "Marsh", color: "#5a7a3a", walkable: true, movementCost: 2.0 },
    { id: "snow", name: "Snow", color: "#f0f0f0", walkable: true, movementCost: 1.5 },
    { id: "hills", name: "Hills", color: "#a0c070", walkable: true, movementCost: 1.3 },
    { id: "farmland", name: "Farmland", color: "#c8a850", walkable: true, movementCost: 1.0 },
    { id: "road", name: "Road", color: "#b8a080", walkable: true, movementCost: 0.7 },
    { id: "stone", name: "Stone Floor", color: "#999999", walkable: true, movementCost: 0.9 },
    { id: "dirt", name: "Dirt", color: "#a07040", walkable: true, movementCost: 1.1 },
    { id: "sand", name: "Sand", color: "#f0e0a0", walkable: true, movementCost: 1.4 },
  ];
  for (const terrain of terrains) registerEntry(registry, terrain);
}

function loadTraits(registry: Registry<TraitEntry>): void {
  const traits: TraitEntry[] = [
    { id: "strong", name: "Strong", category: "physical", description: "Increased carrying capacity and construction speed", effects: [{ targetStat: "hauling_speed", modifier: 0.3, isMultiplier: false }, { targetStat: "construction_speed", modifier: 0.2, isMultiplier: false }] },
    { id: "weak", name: "Weak", category: "physical", description: "Reduced carrying and strength tasks", effects: [{ targetStat: "hauling_speed", modifier: -0.2, isMultiplier: false }] },
    { id: "quick_learner", name: "Quick Learner", category: "mental", description: "Gains experience faster", effects: [{ targetStat: "exp_rate", modifier: 1.5, isMultiplier: true }] },
    { id: "slow_learner", name: "Slow Learner", category: "mental", description: "Gains experience slower", effects: [{ targetStat: "exp_rate", modifier: 0.7, isMultiplier: true }] },
    { id: "social_butterfly", name: "Social Butterfly", category: "social", description: "Social need decays slower", effects: [{ targetStat: "social_decay", modifier: 0.5, isMultiplier: true }] },
    { id: "loner", name: "Loner", category: "social", description: "Doesn't need much social interaction", effects: [{ targetStat: "social_decay", modifier: 0.3, isMultiplier: true }] },
    { id: "devout", name: "Devout", category: "spiritual", description: "Spiritual need is stronger", effects: [{ targetStat: "spiritual_decay", modifier: 1.5, isMultiplier: true }] },
    { id: "hardy", name: "Hardy", category: "physical", description: "Needs less rest", effects: [{ targetStat: "rest_decay", modifier: 0.7, isMultiplier: true }] },
    { id: "glutton", name: "Glutton", category: "physical", description: "Gets hungry faster", effects: [{ targetStat: "hunger_decay", modifier: 1.5, isMultiplier: true }] },
    { id: "talented_smith", name: "Talented Smith", category: "aptitude", description: "Natural talent at metalworking", effects: [{ targetStat: "smithing_speed", modifier: 0.3, isMultiplier: false }] },
  ];
  for (const trait of traits) registerEntry(registry, trait);
}

function loadFactions(registry: Registry<FactionEntry>): void {
  const factions: FactionEntry[] = [
    { id: "village_council", name: "Village Council", category: "political", description: "The governing body of the settlement", initialDisposition: 50 },
    { id: "merchants_guild", name: "Merchants Guild", category: "guild", description: "Trade and commerce guild", initialDisposition: 30 },
    { id: "craftsmen_guild", name: "Craftsmen Guild", category: "guild", description: "Artisan and production guild", initialDisposition: 30 },
    { id: "church", name: "The Church", category: "religious", description: "Religious institution and spiritual guidance", initialDisposition: 20 },
    { id: "thieves_guild", name: "Thieves Guild", category: "criminal", description: "Underground organization", initialDisposition: -30 },
    { id: "knights_order", name: "Knights Order", category: "military", description: "Military protection order", initialDisposition: 10 },
    { id: "farmers_coop", name: "Farmers Cooperative", category: "guild", description: "Agricultural workers union", initialDisposition: 40 },
    { id: "foresters", name: "Foresters", category: "guild", description: "Woodcutters and hunters", initialDisposition: 20 },
  ];
  for (const faction of factions) registerEntry(registry, faction);
}

function loadEntityPrototypes(registry: Registry<EntityPrototypeEntry>): void {
  const prototypes: EntityPrototypeEntry[] = [
    { id: "colonist", name: "Colonist", category: "humanoid", description: "A skilled settler", tags: ["colonist", "humanoid"], components: { health: { current: 100, max: 100 }, needs: true, skills: true, inventory: { capacity: 20 } } },
    { id: "merchant", name: "Merchant", category: "humanoid", description: "Travelling trader", tags: ["merchant", "humanoid", "visitor"], components: { health: { current: 100, max: 100 }, inventory: { capacity: 50 } } },
    { id: "guard", name: "Guard", category: "humanoid", description: "Armed settlement guard", tags: ["guard", "humanoid", "military"], components: { health: { current: 120, max: 120 }, needs: true, skills: true, inventory: { capacity: 15 } } },
    { id: "priest", name: "Priest", category: "humanoid", description: "Religious leader", tags: ["priest", "humanoid", "religious"], components: { health: { current: 80, max: 80 }, needs: true, skills: true, inventory: { capacity: 10 } } },
    { id: "chicken", name: "Chicken", category: "livestock", description: "Domestic fowl", tags: ["animal", "livestock"], components: { health: { current: 20, max: 20 } } },
    { id: "cow", name: "Cow", category: "livestock", description: "Dairy and meat cattle", tags: ["animal", "livestock"], components: { health: { current: 80, max: 80 } } },
    { id: "sheep", name: "Sheep", category: "livestock", description: "Wool-bearing sheep", tags: ["animal", "livestock"], components: { health: { current: 50, max: 50 } } },
    { id: "wolf", name: "Wolf", category: "wild_animal", description: "Dangerous predator", tags: ["animal", "wild", "hostile"], components: { health: { current: 60, max: 60 } } },
    { id: "deer", name: "Deer", category: "wild_animal", description: "Wild game animal", tags: ["animal", "wild", "prey"], components: { health: { current: 40, max: 40 } } },
    { id: "boar", name: "Wild Boar", category: "wild_animal", description: "Aggressive forest creature", tags: ["animal", "wild", "hostile"], components: { health: { current: 70, max: 70 } } },
  ];
  for (const proto of prototypes) registerEntry(registry, proto);
}
