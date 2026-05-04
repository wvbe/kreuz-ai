# Feature Specification: Game World Content — 13th-Century European Setting

**Feature Branch**: `023-game-world-content`
**Created**: 2026-05-03
**Status**: Draft
**Input**: User description: "The setting for the game and all the content that belongs in this game world, including materials, entity prototypes, jobs, terrain types, behavior trees, needs, traits, crafting recipes, furniture, room types, zones, guild factions, religion factions. The setting is a European 13th-century setting, but in no specific country. There should be depth and variability to the game content catalogs."

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Material Catalog (Priority: P1)

The game world uses a rich set of materials grounded in 13th-century European life. Materials span raw resources harvested from the land, processed goods produced at workstations, finished tools and equipment, food and drink, and currency. Every material has a defined stack limit, weight, categories, and — where appropriate — perishability and base trade value. The catalog provides enough variety that production chains have multiple tiers and players face meaningful choices about what to produce.

**Why this priority**: Materials are the atomic unit of the economy. Every other content catalog — recipes, jobs, trade, storage — references materials. Without them, nothing else functions.

**Independent Test**: Load the material registry into the game engine. Verify every entry has valid `id`, `name`, `stackLimit`, `weight`, `categories`, and optional `perishability`/`value`. Verify no duplicate IDs. Verify category tags form a consistent taxonomy.

**Materials — Raw Resources**:

| Material | Categories | Stack Limit | Perishable | Notes |
|---|---|---|---|---|
| Oak Log | wood, raw | 20 | No | Primary hardwood, felled from oak trees |
| Pine Log | wood, raw | 20 | No | Softwood, faster to fell, lighter |
| Birch Log | wood, raw | 20 | No | Light wood, decorative grain |
| Limestone | stone, raw | 15 | No | Common building stone |
| Granite | stone, raw | 10 | No | Heavy, hard, premium construction |
| Clay | raw, ceramic | 30 | No | Pottery, bricks, daub |
| Iron Ore | ore, raw, metal | 15 | No | Mined from rock, requires smelting |
| Copper Ore | ore, raw, metal | 15 | No | Softer metal, decorative and functional |
| Tin Ore | ore, raw, metal | 15 | No | Alloyed with copper for bronze |
| Coal | fuel, raw | 30 | No | Mined; primary smelting fuel |
| Flax | fiber, raw, plant | 30 | No | Spun into linen thread |
| Raw Wool | fiber, raw, animal | 30 | No | Shorn from sheep, spun into thread |
| Wheat | grain, raw, plant | 40 | No | Staple crop, milled into flour |
| Barley | grain, raw, plant | 40 | No | Brewing grain, animal feed |
| Rye | grain, raw, plant | 40 | No | Hardy grain, bread flour |
| Raw Hide | animal, raw | 10 | Yes | Animal skin, must be tanned before decay |
| Tallow | animal, raw, fuel | 20 | No | Rendered animal fat, candle and soap making |
| Herbs | plant, raw, medicinal | 20 | Yes | Gathered wild or cultivated, healing use |
| Salt | mineral, raw, preservative | 40 | No | Critical for food preservation |
| Sand | raw, mineral | 20 | No | Glassmaking (rare craft) |
| Honey | food, raw, sweet | 20 | No | Harvested from apiaries, sweetener and mead |
| Raw Fish | food, raw, animal | 10 | Yes | Caught from rivers/ponds, short shelf life |
| Raw Meat | food, raw, animal | 10 | Yes | Butchered from livestock |
| Milk | food, raw, animal | 10 | Yes | From cows and goats, very short shelf life |
| Grapes | food, raw, plant | 20 | Yes | Vineyard crop, winemaking |
| Vegetables | food, raw, plant | 20 | Yes | Garden produce (turnips, cabbage, onions, beans) |
| Fruit | food, raw, plant | 20 | Yes | Orchard produce (apples, pears, plums) |
| Oak Bark | raw, plant, tanning | 30 | No | Stripped from oak, used in tanning |
| Beeswax | raw, animal | 20 | No | From beehives, candles and seals |

**Materials — Processed Goods**:

| Material | Categories | Stack Limit | Inputs | Notes |
|---|---|---|---|---|
| Oak Plank | wood, processed | 30 | Oak Log | Sawn lumber |
| Pine Plank | wood, processed | 30 | Pine Log | Light lumber |
| Birch Plank | wood, processed | 30 | Birch Log | Decorative lumber |
| Stone Block | stone, processed | 10 | Limestone or Granite | Cut and dressed |
| Brick | ceramic, processed, building | 30 | Clay | Kiln-fired |
| Iron Ingot | metal, processed | 20 | Iron Ore + Coal | Smelted bar |
| Copper Ingot | metal, processed | 20 | Copper Ore + Coal | Smelted bar |
| Bronze Ingot | metal, processed, alloy | 20 | Copper Ingot + Tin Ore | Alloy, harder than copper |
| Charcoal | fuel, processed | 30 | Oak/Pine/Birch Log | Slow-burned wood; fuel alternative |
| Flour | grain, processed | 30 | Wheat or Rye | Ground at mill |
| Malt | grain, processed, brewing | 30 | Barley | Malted for ale and beer |
| Linen Thread | fiber, processed | 40 | Flax | Spun fiber |
| Wool Thread | fiber, processed | 40 | Raw Wool | Spun fiber |
| Linen Cloth | textile, processed | 20 | Linen Thread | Woven on loom |
| Wool Cloth | textile, processed | 20 | Wool Thread | Woven on loom |
| Leather | animal, processed | 15 | Raw Hide + Oak Bark | Tanned and cured |
| Nails | metal, processed, fastener | 50 | Iron Ingot | Small hardware |
| Rope | fiber, processed | 20 | Flax | Twisted cordage |
| Parchment | animal, processed, writing | 15 | Raw Hide | Scraped and dried for writing |
| Candle | processed, light | 30 | Tallow or Beeswax | Illumination |
| Glass Pane | processed, rare, building | 10 | Sand + Coal | Expensive, church windows |
| Plaster | processed, building | 20 | Limestone | Crusite ground for wall finishing |

**Materials — Finished Goods (Tools & Equipment)**:

| Material | Categories | Stack Limit | Inputs | Notes |
|---|---|---|---|---|
| Iron Hammer | tool, metal | 5 | Iron Ingot + Oak Plank | Smithing & construction |
| Iron Chisel | tool, metal | 5 | Iron Ingot | Masonry & stonework |
| Saw | tool, metal, wood | 5 | Iron Ingot + Oak Plank | Carpentry |
| Axe | tool, metal, wood | 5 | Iron Ingot + Oak Plank | Woodcutting |
| Pickaxe | tool, metal, wood | 5 | Iron Ingot + Oak Plank | Mining |
| Sickle | tool, metal | 5 | Iron Ingot + Oak Plank | Harvesting crops |
| Hoe | tool, metal, wood | 5 | Iron Ingot + Oak Plank | Tilling soil |
| Fishing Rod | tool, wood | 5 | Pine Plank + Linen Thread | Fishing |
| Needle | tool, metal | 10 | Iron Ingot | Tailoring |
| Iron Sword | weapon, metal | 3 | Iron Ingot + Leather | Military weapon |
| Iron Shield | weapon, metal, wood | 3 | Iron Ingot + Oak Plank | Defensive equipment |
| Spear | weapon, metal, wood | 5 | Iron Ingot + Oak Plank | Common military weapon |
| Bow | weapon, wood | 3 | Birch Plank + Linen Thread | Ranged weapon |
| Arrow | weapon, wood, metal | 20 | Pine Plank + Iron Ingot | Ammunition |
| Leather Armor | armor, leather | 3 | Leather | Light protection |
| Iron Chainmail | armor, metal | 2 | Iron Ingot (many) | Heavy protection, expensive |
| Iron Helm | armor, metal | 3 | Iron Ingot | Head protection |
| Peasant Clothing | clothing, textile | 5 | Linen Cloth or Wool Cloth | Basic garments |
| Fine Clothing | clothing, textile, luxury | 3 | Wool Cloth + Linen Thread | Noble/merchant attire |
| Monk's Habit | clothing, textile, religious | 5 | Wool Cloth | Monastic garments |

**Materials — Food & Drink**:

| Material | Categories | Stack Limit | Perishable | Notes |
|---|---|---|---|---|
| Bread | food, cooked, staple | 20 | Yes | Daily staple, baked from flour |
| Rye Bread | food, cooked, staple | 20 | Yes | Darker, coarser, cheaper loaf |
| Ale | drink, brewed | 15 | Yes | Daily beverage, brewed from malt |
| Wine | drink, brewed, luxury | 15 | Yes (slow) | From grapes, ages slowly |
| Mead | drink, brewed | 15 | Yes | From honey, sweet and strong |
| Cheese | food, dairy, preserved | 20 | Yes (slow) | Pressed from milk, stores well |
| Dried Meat | food, preserved | 20 | Yes (slow) | Smoked or dried, travel ration |
| Salted Fish | food, preserved | 20 | Yes (slow) | Salt-cured, long shelf life |
| Pottage | food, cooked | 10 | Yes | Vegetable/grain stew, peasant staple |
| Stew | food, cooked | 10 | Yes | Hearty meat and vegetable dish |
| Roast Meat | food, cooked | 10 | Yes | Cooked fresh meat |
| Fruit Preserves | food, preserved, sweet | 15 | Yes (slow) | Fruit cooked with honey |
| Butter | food, dairy | 15 | Yes | Churned from milk |
| Porridge | food, cooked, staple | 10 | Yes | Oat or barley cereal |

**Materials — Currency**:

| Material | Categories | Stack Limit | Notes |
|---|---|---|---|
| Silver Penny | currency | 1000 | Standard unit of exchange, the penny (denarius) |

**Acceptance Scenarios**:

1. **Given** the material registry is loaded, **When** queried for all materials with category `food`, **Then** at least 14 entries are returned, each with valid `perishability` durations.
2. **Given** a material with category `raw`, **When** cross-referenced with the recipe registry, **Then** at least one recipe exists that uses it as an input (no orphan raw materials).
3. **Given** all tool materials, **When** checked against construction and crafting recipe restrictions, **Then** each tool is required by at least one recipe or construction job as a non-consumed tool.
4. **Given** the currency material "Silver Penny", **When** used in trade (spec 019), **Then** it functions identically to any other stackable material with `stackLimit: 1000`.
5. **Given** perishable materials, **When** stored in a Pantry zone (spec 018), **Then** their decay rate is reduced by the zone's configured modifier.

---

### User Story 2 — Crafting Recipe Chains (Priority: P1)

The production system (spec 014) is populated with multi-tier crafting recipes that form interconnected supply chains. Raw materials are refined into processed goods, which are further combined into finished items. Each recipe specifies inputs, outputs (including byproducts), duration, workstation restrictions, optional room restrictions, and optional skill requirements. The recipe set creates meaningful economic depth: producing a sword requires mining ore, smelting ingots, tanning leather, and smithing — a four-step chain involving multiple workstations and skills.

**Why this priority**: Recipes drive the production loop. Without them, materials are inert and workstations are furniture with no purpose.

**Independent Test**: Load the recipe registry. Verify every recipe references valid material IDs (from Story 1) and valid workstation entity types (from Story 3). Verify no circular dependencies. Verify every processed/finished material has at least one recipe that produces it.

**Recipes — Wood Processing**:

| Recipe | Inputs | Outputs | Workstation | Duration | Skill |
|---|---|---|---|---|---|
| Saw Oak Planks | 1 Oak Log | 4 Oak Plank | Sawmill | 20 ticks | Carpentry |
| Saw Pine Planks | 1 Pine Log | 4 Pine Plank | Sawmill | 16 ticks | Carpentry |
| Saw Birch Planks | 1 Birch Log | 4 Birch Plank | Sawmill | 18 ticks | Carpentry |
| Burn Charcoal | 3 Oak Log | 2 Charcoal | Charcoal Kiln | 40 ticks | — |

**Recipes — Metal Processing**:

| Recipe | Inputs | Outputs | Workstation | Duration | Skill |
|---|---|---|---|---|---|
| Smelt Iron | 2 Iron Ore + 1 Coal | 1 Iron Ingot | Smelter | 36 ticks | Smithing |
| Smelt Copper | 2 Copper Ore + 1 Coal | 1 Copper Ingot | Smelter | 30 ticks | Smithing |
| Alloy Bronze | 1 Copper Ingot + 1 Tin Ore | 1 Bronze Ingot | Smelter | 40 ticks | Smithing |
| Forge Nails | 1 Iron Ingot | 10 Nails | Anvil | 20 ticks | Smithing |

**Recipes — Tool & Equipment Crafting**:

| Recipe | Inputs | Outputs | Workstation | Duration | Skill |
|---|---|---|---|---|---|
| Forge Hammer | 2 Iron Ingot + 1 Oak Plank | 1 Iron Hammer | Anvil | 30 ticks | Smithing |
| Forge Chisel | 1 Iron Ingot | 1 Iron Chisel | Anvil | 24 ticks | Smithing |
| Craft Saw | 2 Iron Ingot + 1 Oak Plank | 1 Saw | Anvil | 30 ticks | Smithing |
| Forge Axe | 2 Iron Ingot + 1 Oak Plank | 1 Axe | Anvil | 28 ticks | Smithing |
| Forge Pickaxe | 2 Iron Ingot + 1 Oak Plank | 1 Pickaxe | Anvil | 28 ticks | Smithing |
| Forge Sickle | 1 Iron Ingot + 1 Oak Plank | 1 Sickle | Anvil | 22 ticks | Smithing |
| Forge Hoe | 1 Iron Ingot + 1 Oak Plank | 1 Hoe | Anvil | 22 ticks | Smithing |
| Craft Fishing Rod | 1 Pine Plank + 1 Linen Thread | 1 Fishing Rod | Workbench | 16 ticks | Carpentry |
| Forge Needle | 1 Iron Ingot | 3 Needle | Anvil | 18 ticks | Smithing |

**Recipes — Weapons & Armor**:

| Recipe | Inputs | Outputs | Workstation | Duration | Skill |
|---|---|---|---|---|---|
| Forge Sword | 3 Iron Ingot + 1 Leather | 1 Iron Sword | Anvil | 60 ticks | Smithing |
| Forge Shield | 2 Iron Ingot + 1 Oak Plank | 1 Iron Shield | Anvil | 40 ticks | Smithing |
| Forge Spear | 1 Iron Ingot + 1 Oak Plank | 1 Spear | Anvil | 24 ticks | Smithing |
| Craft Bow | 1 Birch Plank + 1 Linen Thread | 1 Bow | Workbench | 30 ticks | Carpentry |
| Fletch Arrows | 1 Pine Plank + 1 Iron Ingot | 10 Arrow | Workbench | 20 ticks | Carpentry |
| Craft Leather Armor | 4 Leather | 1 Leather Armor | Workbench | 50 ticks | Leatherworking |
| Forge Chainmail | 6 Iron Ingot | 1 Iron Chainmail | Anvil | 120 ticks | Smithing |
| Forge Helm | 2 Iron Ingot | 1 Iron Helm | Anvil | 36 ticks | Smithing |

**Recipes — Textile Processing**:

| Recipe | Inputs | Outputs | Workstation | Duration | Skill |
|---|---|---|---|---|---|
| Spin Linen Thread | 2 Flax | 3 Linen Thread | Spinning Wheel | 16 ticks | Weaving |
| Spin Wool Thread | 2 Raw Wool | 3 Wool Thread | Spinning Wheel | 16 ticks | Weaving |
| Weave Linen Cloth | 3 Linen Thread | 1 Linen Cloth | Loom | 30 ticks | Weaving |
| Weave Wool Cloth | 3 Wool Thread | 1 Wool Cloth | Loom | 30 ticks | Weaving |
| Sew Peasant Clothing | 2 Linen Cloth | 1 Peasant Clothing | Tailoring Bench | 24 ticks | Tailoring |
| Sew Fine Clothing | 2 Wool Cloth + 1 Linen Thread | 1 Fine Clothing | Tailoring Bench | 48 ticks | Tailoring |
| Sew Monk's Habit | 3 Wool Cloth | 1 Monk's Habit | Tailoring Bench | 30 ticks | Tailoring |
| Twist Rope | 3 Flax | 1 Rope | Rope Walk | 20 ticks | — |

**Recipes — Leather Processing**:

| Recipe | Inputs | Outputs | Workstation | Duration | Skill |
|---|---|---|---|---|---|
| Tan Hide | 1 Raw Hide + 2 Oak Bark | 1 Leather | Tanning Rack | 48 ticks | Leatherworking |
| Scrape Parchment | 1 Raw Hide | 1 Parchment | Parchment Frame | 36 ticks | Leatherworking |

**Recipes — Stonework & Building**:

| Recipe | Inputs | Outputs | Workstation | Duration | Skill |
|---|---|---|---|---|---|
| Cut Stone Block | 2 Limestone | 1 Stone Block | Mason's Bench | 24 ticks | Masonry |
| Cut Granite Block | 2 Granite | 1 Stone Block | Mason's Bench | 32 ticks | Masonry |
| Fire Bricks | 4 Clay + 1 Coal | 6 Brick | Kiln | 30 ticks | Masonry |
| Mix Plaster | 2 Limestone | 3 Plaster | Mason's Bench | 16 ticks | Masonry |
| Blow Glass Pane | 2 Sand + 1 Coal | 1 Glass Pane | Kiln | 60 ticks | Glassblowing |

**Recipes — Food & Drink**:

| Recipe | Inputs | Outputs | Workstation | Duration | Skill |
|---|---|---|---|---|---|
| Grind Flour | 2 Wheat | 3 Flour | Grinding Mill | 12 ticks | — |
| Grind Rye Flour | 2 Rye | 3 Flour | Grinding Mill | 12 ticks | — |
| Bake Bread | 2 Flour | 2 Bread | Oven | 20 ticks | Baking |
| Bake Rye Bread | 2 Flour (from Rye) | 2 Rye Bread | Oven | 20 ticks | Baking |
| Malt Barley | 3 Barley | 2 Malt | Malting Floor | 24 ticks | Brewing |
| Brew Ale | 3 Malt | 2 Ale | Brewing Vat | 36 ticks | Brewing |
| Brew Mead | 2 Honey | 2 Mead | Brewing Vat | 40 ticks | Brewing |
| Press Cheese | 3 Milk | 1 Cheese | Cheese Press | 30 ticks | Cooking |
| Churn Butter | 2 Milk | 1 Butter | Churn | 16 ticks | Cooking |
| Dry Meat | 2 Raw Meat + 1 Salt | 2 Dried Meat | Drying Rack | 48 ticks | Cooking |
| Salt Fish | 2 Raw Fish + 1 Salt | 2 Salted Fish | Salting Table | 36 ticks | Cooking |
| Cook Pottage | 2 Vegetables + 1 Barley | 2 Pottage | Cooking Pot | 20 ticks | Cooking |
| Cook Stew | 1 Raw Meat + 1 Vegetables | 2 Stew | Cooking Pot | 24 ticks | Cooking |
| Roast Meat | 1 Raw Meat | 1 Roast Meat | Oven | 16 ticks | Cooking |
| Cook Porridge | 2 Barley | 2 Porridge | Cooking Pot | 12 ticks | Cooking |
| Make Preserves | 2 Fruit + 1 Honey | 2 Fruit Preserves | Cooking Pot | 28 ticks | Cooking |
| Press Wine | 4 Grapes | 2 Wine | Wine Press | 40 ticks | Brewing |

**Recipes — Miscellaneous**:

| Recipe | Inputs | Outputs | Workstation | Duration | Skill |
|---|---|---|---|---|---|
| Dip Candles | 2 Tallow | 4 Candle | Candle Mold | 16 ticks | — |
| Mold Beeswax Candles | 1 Beeswax | 3 Candle | Candle Mold | 16 ticks | — |

**Acceptance Scenarios**:

1. **Given** the recipe "Forge Sword" (3 Iron Ingot + 1 Leather → 1 Iron Sword), **When** traced backward through all prerequisite recipes, **Then** the full chain is: Iron Ore → Iron Ingot (Smelter) + Raw Hide → Leather (Tanning Rack) → Iron Sword (Anvil) — at least a 3-tier depth.
2. **Given** all recipes are loaded, **When** every processed material in the material catalog is checked, **Then** at least one recipe produces it as output.
3. **Given** a recipe with a workstation restriction (e.g., "Anvil"), **When** cross-referenced with the furniture catalog (Story 3), **Then** a matching entity prototype exists.
4. **Given** a recipe with a skill requirement (e.g., "Smithing"), **When** cross-referenced with the skill catalog (Story 6), **Then** a matching skill entry exists.
5. **Given** the recipe registry, **When** analyzed for dependency cycles, **Then** no circular chains are found (no material requires itself directly or transitively to produce).

---

### User Story 3 — Furniture & Workstation Catalog (Priority: P1)

The game world contains a variety of placeable furniture entities. Each has a defined entity prototype with components for position, optional inventory, and purpose. Furniture falls into several functional categories: workstations (enable crafting), storage (hold materials), comfort (satisfy needs), religious (enable faith activities), utility (functional items), and decorative (beauty/mood). Workstations are the critical link between recipes and production — a recipe that requires an Anvil cannot be started unless an Anvil entity exists in an appropriate zone.

**Why this priority**: Workstations gate all crafting. Storage furniture gates all stockpiling. Comfort furniture gates need satisfaction. Without furniture, zones are empty rooms.

**Independent Test**: Load all furniture prototypes. Verify each has valid components (Position required; Inventory for storage/workstations). Verify every workstation referenced by a recipe (Story 2) has a matching prototype.

**Workstation Furniture**:

| Prototype | Category | Has Inventory | Enables | Construction Materials |
|---|---|---|---|---|
| Sawmill | workstation, wood | Yes | Wood processing recipes | 4 Oak Plank, 4 Nails |
| Forge | workstation, metal | Yes | Metal smelting prep, heating | 8 Stone Block, 4 Iron Ingot |
| Anvil | workstation, metal | Yes | Smithing recipes | 4 Iron Ingot |
| Smelter | workstation, metal | Yes | Ore smelting recipes | 10 Stone Block, 2 Iron Ingot |
| Oven | workstation, food | Yes | Baking recipes | 6 Brick, 2 Iron Ingot |
| Workbench | workstation, general | Yes | General crafting recipes | 4 Oak Plank, 4 Nails |
| Spinning Wheel | workstation, textile | Yes | Thread spinning recipes | 4 Oak Plank, 2 Rope |
| Loom | workstation, textile | Yes | Cloth weaving recipes | 6 Oak Plank, 4 Nails, 2 Rope |
| Tanning Rack | workstation, leather | Yes | Hide tanning recipes | 4 Oak Plank, 2 Rope |
| Parchment Frame | workstation, leather | Yes | Parchment making | 4 Oak Plank |
| Tailoring Bench | workstation, textile | Yes | Clothing sewing recipes | 4 Oak Plank, 2 Nails |
| Grinding Mill | workstation, food | Yes | Grain milling recipes | 4 Stone Block, 2 Oak Plank |
| Malting Floor | workstation, food | Yes | Malt processing | 6 Brick |
| Brewing Vat | workstation, food | Yes | Ale, mead brewing recipes | 4 Oak Plank, 4 Nails, 1 Rope |
| Wine Press | workstation, food | Yes | Wine pressing | 6 Oak Plank, 2 Iron Ingot |
| Cheese Press | workstation, food | Yes | Cheese making | 4 Oak Plank, 2 Stone Block |
| Churn | workstation, food | Yes | Butter churning | 2 Oak Plank, 2 Nails |
| Cooking Pot | workstation, food | Yes | Stew, pottage, preserves | 2 Iron Ingot, 1 Rope |
| Drying Rack | workstation, food | Yes | Meat drying | 4 Oak Plank, 2 Rope |
| Salting Table | workstation, food | Yes | Fish salting | 4 Oak Plank, 2 Nails |
| Mason's Bench | workstation, stone | Yes | Stonecutting recipes | 4 Oak Plank, 2 Iron Chisel |
| Kiln | workstation, ceramic | Yes | Brick firing, glassblowing | 8 Brick, 2 Iron Ingot |
| Charcoal Kiln | workstation, fuel | No | Charcoal burning | 6 Clay, 4 Stone Block |
| Candle Mold | workstation, utility | Yes | Candle making | 2 Iron Ingot |
| Rope Walk | workstation, fiber | No | Rope twisting | 4 Oak Plank |
| Butcher's Block | workstation, food | Yes | Butchering carcasses | 2 Oak Plank, 1 Iron Ingot |
| Apiary | workstation, food | No | Honey & beeswax production | 4 Pine Plank, 1 Rope |

**Storage Furniture**:

| Prototype | Category | Slots | Weight Limit | Material Filter | Construction Materials |
|---|---|---|---|---|---|
| Chest | storage, wood | 12 | 200 | Any | 4 Oak Plank, 4 Nails |
| Barrel | storage, wood | 8 | 150 | drink, grain, preserved | 4 Oak Plank, 2 Nails, 1 Rope |
| Crate | storage, wood | 10 | 180 | Any | 4 Pine Plank, 4 Nails |
| Sack | storage, textile | 4 | 80 | grain, flour, fiber | 1 Linen Cloth, 1 Rope |
| Bookcase | storage, wood | 6 | 60 | writing, parchment | 6 Oak Plank, 6 Nails |
| Coffer | storage, wood, secure | 8 | 100 | currency, valuable | 4 Oak Plank, 4 Nails, 2 Iron Ingot |
| Weapon Rack | storage, wood, military | 6 | 120 | weapon | 4 Oak Plank, 4 Nails |
| Armor Stand | storage, wood, military | 4 | 100 | armor | 4 Oak Plank, 2 Nails |
| Wine Rack | storage, wood | 6 | 80 | drink | 4 Oak Plank, 4 Nails |
| Tool Rack | storage, wood | 8 | 100 | tool | 4 Pine Plank, 4 Nails |
| Pantry Shelf | storage, wood | 10 | 150 | food | 4 Pine Plank, 6 Nails |
| Grain Bin | storage, wood | 6 | 200 | grain | 6 Oak Plank, 4 Nails |

**Comfort & Living Furniture**:

| Prototype | Category | Effect | Construction Materials |
|---|---|---|---|
| Straw Pallet | bed, comfort, basic | Rest satisfaction (low quality) | 4 Flax, 2 Pine Plank |
| Wooden Bed | bed, comfort | Rest satisfaction (standard) | 6 Oak Plank, 4 Nails, 1 Wool Cloth |
| Noble Bed | bed, comfort, luxury | Rest satisfaction (high quality) + mood bonus | 8 Oak Plank, 6 Nails, 2 Wool Cloth, 2 Linen Cloth |
| Bench | seating, comfort | Minor comfort, social gathering point | 3 Oak Plank, 2 Nails |
| Chair | seating, comfort | Comfort satisfaction | 3 Oak Plank, 4 Nails |
| Table | surface, social | Social gathering, dining | 4 Oak Plank, 4 Nails |
| Long Table | surface, social, large | Feast/communal dining, higher social satisfaction | 8 Oak Plank, 8 Nails |
| Hearth | warmth, comfort | Comfort bonus to room occupants | 6 Stone Block, 2 Iron Ingot |
| Throne | seating, governance | Marks seat of government; leader furniture | 6 Oak Plank, 4 Stone Block, 2 Iron Ingot |

**Religious Furniture**:

| Prototype | Category | Effect | Construction Materials |
|---|---|---|---|
| Altar | religious, worship | Faith satisfaction, prayer activity | 4 Stone Block |
| Candelabra | religious, light | Faith bonus, illumination | 2 Iron Ingot, 4 Candle |
| Lectern | religious, worship | Preaching activity point | 4 Oak Plank, 2 Nails |
| Reliquary | religious, worship, luxury | Strong faith satisfaction | 2 Iron Ingot, 1 Glass Pane |
| Prayer Bench | religious, seating | Faith + comfort | 3 Oak Plank, 2 Nails |
| Church Bell | religious, utility | Calls congregation, event trigger | 4 Bronze Ingot |

**Utility & Decorative Furniture**:

| Prototype | Category | Effect | Construction Materials |
|---|---|---|---|
| Well | utility, water | Water access point | 8 Stone Block, 2 Rope |
| Trough | utility, animal | Animal feeding point | 4 Oak Plank, 2 Nails |
| Hitching Post | utility, animal | Animal tethering | 2 Oak Plank, 1 Rope |
| Torch Sconce | light, utility | Illumination | 1 Iron Ingot |
| Chandelier | light, luxury | Strong illumination + mood bonus | 4 Iron Ingot, 6 Candle |
| Tapestry | decorative, textile, luxury | Mood bonus | 3 Wool Cloth, 2 Linen Thread |
| Banner | decorative, textile | Faction identity, minor mood | 1 Linen Cloth, 1 Pine Plank |
| Gravestone | decorative, stone | Memorial for deceased | 2 Stone Block |
| Signpost | utility, wood | Way marker | 2 Pine Plank, 2 Nails |

**Acceptance Scenarios**:

1. **Given** every recipe workstation reference in the recipe catalog, **When** checked against this furniture catalog, **Then** a matching prototype exists for each.
2. **Given** a Forge prototype, **When** placed in a Smithy zone, **Then** the zone's furniture requirements that include `Forge` are satisfied.
3. **Given** storage furniture prototypes, **When** their material filters are evaluated, **Then** the Barrel accepts `drink` and `grain` categories but rejects `metal` items.
4. **Given** a Wooden Bed entity placed in a Bedroom zone, **When** an entity with low Rest need approaches, **Then** the bed enables rest satisfaction at standard quality.
5. **Given** all furniture construction material requirements, **When** cross-referenced with the material catalog, **Then** every required material exists.

---

### User Story 4 — Zone & Room Type Catalog (Priority: P1)

The game world has a rich set of zone types that define the functional identity of spaces. Zones are either rooms (enclosed, detected per spec 015) or open-air zones (unenclosed). Each zone type declares its furniture requirements, minimum tile count, any effects on entities or items within it, and its profession affinity. The variety of zones drives the player's colony layout decisions and gates different production chains and activities.

**Why this priority**: Zones activate production recipes, storage behaviors, and need satisfaction. Without zone type definitions, the physical layout has no meaning.

**Independent Test**: Load all zone type definitions. Verify each references valid furniture prototype tags (from Story 3). Verify effects use valid modifier IDs. Verify no two zone types have identical requirement sets.

**Production Zones (Rooms)**:

| Zone Type | Requires Room | Min Tiles | Furniture Requirements | Effect | Profession Affinity |
|---|---|---|---|---|---|
| Bakery | Yes | 6 | 1× Oven | activity.unlock: baking | Baker |
| Smithy | Yes | 8 | 1× Forge + 1× Anvil | activity.unlock: smithing | Blacksmith |
| Carpentry | Yes | 6 | 1× Sawmill + 1× Workbench | activity.unlock: woodworking | Carpenter |
| Tannery | Yes | 6 | 1× Tanning Rack | activity.unlock: leatherworking | Tanner |
| Pottery | Yes | 6 | 1× Kiln | activity.unlock: pottery | Potter |
| Brewery | Yes | 8 | 1× Brewing Vat + 1× Malting Floor | activity.unlock: brewing | Brewer |
| Weaving Hall | Yes | 6 | 1× Loom + 1× Spinning Wheel | activity.unlock: weaving | Weaver |
| Kitchen | Yes | 6 | 1× Cooking Pot + 1× Butcher's Block | activity.unlock: cooking | Cook |
| Smokehouse | Yes | 4 | 1× Drying Rack | activity.unlock: preserving | Cook |
| Mason's Workshop | Yes | 6 | 1× Mason's Bench | activity.unlock: masonry | Mason |
| Scriptorium | Yes | 6 | 1× Bookcase + 1× Lectern | activity.unlock: scholarship | Scholar |

**Storage & Utility Zones (Rooms)**:

| Zone Type | Requires Room | Min Tiles | Furniture Requirements | Effect | Notes |
|---|---|---|---|---|---|
| Pantry | Yes | 4 | 1× Pantry Shelf | entity.modifier: inventory.decay.rate × 0.5 | Halves food decay |
| Wine Cellar | Yes | 4 | 1× Wine Rack + 1× Barrel | entity.modifier: inventory.decay.rate × 0.3 | Best preservation for drinks |
| Warehouse | Yes | 8 | 2× Crate or 2× Chest | — | General bulk storage |
| Armory | Yes | 6 | 1× Weapon Rack + 1× Armor Stand | — | Military equipment storage |

**Living & Social Zones (Rooms)**:

| Zone Type | Requires Room | Min Tiles | Furniture Requirements | Effect | Notes |
|---|---|---|---|---|---|
| Bedroom | Yes | 4 | 1× (any bed type) | — | Rest satisfaction location |
| Dormitory | Yes | 8 | 3× (any bed type) | — | Shared sleeping quarters |
| Great Hall | Yes | 12 | 1× Long Table + 1× Hearth | entity.modifier: mood.bonus +5, social.bonus +10 | Feasting, social hub |
| Tavern | Yes | 8 | 1× Table + 1× Bench + 1× Barrel | entity.modifier: social.bonus +5 | Drink and conversation |
| Throne Room | Yes | 10 | 1× Throne | — | Seat of government; treasury location (spec 019) |

**Religious Zones (Rooms)**:

| Zone Type | Requires Room | Min Tiles | Furniture Requirements | Effect | Notes |
|---|---|---|---|---|---|
| Chapel | Yes | 8 | 1× Altar + 1× Candelabra | entity.modifier: faith.bonus +10 | Small worship space |
| Church | Yes | 16 | 1× Altar + 2× Candelabra + 1× Lectern + 2× Prayer Bench | entity.modifier: faith.bonus +20 | Full worship space |
| Cloister | Yes | 10 | 1× Prayer Bench + 1× Bookcase | entity.modifier: faith.bonus +5, mood.bonus +3 | Monastic contemplation |

**Military Zones (Rooms)**:

| Zone Type | Requires Room | Min Tiles | Furniture Requirements | Effect | Notes |
|---|---|---|---|---|---|
| Barracks | Yes | 8 | 2× Straw Pallet + 1× Weapon Rack | — | Guard housing |
| Guard Post | No | 2 | — | entity.modifier: safety.bonus +10 (area) | Small watch point |

**Open-Air Zones**:

| Zone Type | Requires Room | Min Tiles | Furniture Requirements | Effect | Notes |
|---|---|---|---|---|---|
| Farm Field | No | 9 | — | activity.unlock: farming | Crop planting and harvest |
| Pasture | No | 12 | 1× Trough | activity.unlock: animal.husbandry | Livestock grazing |
| Orchard | No | 9 | — | activity.unlock: orcharding | Fruit trees |
| Herb Garden | No | 6 | — | activity.unlock: herbalism | Medicinal plant cultivation |
| Vineyard | No | 9 | — | activity.unlock: viticulture | Grape cultivation |
| Quarry | No | 6 | — | activity.unlock: quarrying | Stone extraction |
| Charcoal Yard | No | 4 | 1× Charcoal Kiln | activity.unlock: charcoal.burning | Charcoal production |
| Fishing Dock | No | 4 | — | activity.unlock: fishing | Requires adjacent water |
| Apiary Yard | No | 4 | 1× Apiary | activity.unlock: beekeeping | Honey and beeswax |
| Market | No | 8 | 1× Table | — | Open-air trading area |
| Cemetery | No | 6 | — | entity.modifier: faith.bonus +3 | Burial and mourning |
| Stockpile | No | 4 | — | — | General material staging |

**Acceptance Scenarios**:

1. **Given** a fully enclosed room with 1 Oven placed on its tiles and at least 6 tiles, **When** zone detection runs, **Then** it qualifies as a Bakery zone.
2. **Given** a Pantry zone with a Pantry Shelf containing perishable Cheese, **When** the decay system ticks, **Then** the Cheese decays at half the normal rate.
3. **Given** a Great Hall zone with Long Table and Hearth, **When** entities gather in the zone, **Then** they receive a +5 mood bonus and +10 social satisfaction bonus.
4. **Given** a Farm Field zone (open-air, no room required), **When** a farming job is posted, **Then** the zone's `activity.unlock: farming` enables crop work.
5. **Given** a zone type definition referencing furniture tag `Oven`, **When** checked against the furniture catalog, **Then** at least one prototype carries that tag.

---

### User Story 5 — Humanoid Entity Prototypes (Priority: P1)

The game world is populated by a variety of humanoid entity types, each with default components that define their starting skills, typical traits, equipment, and role in the settlement. No rigid class system exists — any humanoid can learn any skill — but prototypes provide meaningful starting differentiation. Prototypes cover the full breadth of a 13th-century village: farmers, craftsmen, traders, soldiers, clergy, and labourers.

**Why this priority**: Humanoids are the actors of every system. Without differentiated prototypes, all entities start identical and the world lacks character.

**Independent Test**: Load all humanoid prototypes. Verify each has valid components (Position, Inventory, TaskQueue, factions, needs). Verify starting skill values reference valid skill IDs (Story 6). Verify default traits reference valid trait IDs (Story 7).

**Humanoid Entity Prototypes**:

| Prototype | Starting Skills (examples) | Default Equipment | Default Factions | Notes |
|---|---|---|---|---|
| Peasant | Farming 10, Hauling 5 | Hoe, Peasant Clothing | (none) | Basic agricultural worker; most common |
| Farmer | Farming 25, Animal Husbandry 10, Cooking 5 | Sickle, Peasant Clothing | (none) | Experienced crop and livestock tender |
| Blacksmith | Smithing 30, Mining 10 | Iron Hammer, Peasant Clothing | Blacksmith's Guild | Metal crafter |
| Carpenter | Carpentry 30, Construction 10 | Saw, Peasant Clothing | Carpenter's Guild | Woodworker and builder |
| Mason | Masonry 30, Construction 15 | Iron Chisel, Peasant Clothing | Mason's Guild | Stoneworker and builder |
| Baker | Baking 30, Cooking 10 | Peasant Clothing | Baker's Guild | Bread and pastry maker |
| Brewer | Brewing 30, Cooking 5 | Peasant Clothing | Brewer's Guild | Ale, mead, and wine maker |
| Weaver | Weaving 30, Tailoring 10 | Needle, Peasant Clothing | Weaver's Guild | Textile producer |
| Tanner | Leatherworking 30, Hauling 5 | Peasant Clothing | Tanner's Guild | Hide processor |
| Potter | Masonry 15, Cooking 5 | Peasant Clothing | Potter's Guild | Ceramic crafter |
| Cook | Cooking 30, Baking 10 | Peasant Clothing | (none) | Kitchen worker |
| Fisherman | Fishing 25, Cooking 5 | Fishing Rod, Peasant Clothing | (none) | River and pond fisher |
| Herbalist | Herbalism 30, Cooking 10 | Herbs, Peasant Clothing | (none) | Healer, herb cultivator |
| Miner | Mining 30, Hauling 10 | Pickaxe, Peasant Clothing | (none) | Ore and coal extraction |
| Lumberjack | Woodcutting 25, Carpentry 5 | Axe, Peasant Clothing | (none) | Tree felling |
| Shepherd | Animal Husbandry 25, Farming 5 | Peasant Clothing | (none) | Livestock minder |
| Guard | Combat 25, Hauling 5 | Spear, Leather Armor, Iron Helm | (none) | Settlement defense |
| Soldier | Combat 35, Hauling 10 | Iron Sword, Iron Chainmail, Iron Shield, Iron Helm | (none) | Trained fighter |
| Merchant | Trading 30 | Fine Clothing, Silver Penny ×100 | Merchant's Guild | Trader; `sellsItems: true` |
| Priest | Preaching 30, Herbalism 10 | Monk's Habit | The Parish | Religious leader |
| Monk | Preaching 20, Brewing 15, Herbalism 15 | Monk's Habit | Monastic Order | Scholar and brewer |
| Scholar | Preaching 10, Trading 5 | Fine Clothing, Parchment | (none) | Literate, record-keeping |
| Noble | Trading 15, Combat 10 | Fine Clothing, Silver Penny ×200 | (none) | Wealthy, governing class |

**Acceptance Scenarios**:

1. **Given** a Blacksmith prototype is instantiated, **When** its skill profile is queried, **Then** Smithing = 30, Mining = 10, all others = 0.
2. **Given** a Merchant prototype, **When** the `sellsItems` flag is checked, **Then** it is `true`, enabling trade participation (spec 019).
3. **Given** a Priest prototype, **When** its default factions are queried, **Then** it belongs to "The Parish" religious faction.
4. **Given** any humanoid prototype, **When** its needs component is queried, **Then** it has all six needs (Hunger, Rest, Safety, Social, Comfort, Faith) initialized to their starting values.
5. **Given** prototypes Peasant and Noble, **When** compared, **Then** they differ in starting skills, equipment, and initial currency — providing meaningful gameplay differentiation.

---

### User Story 6 — Skill Catalog (Priority: P1)

The game defines a set of skills (spec 020) grounded in 13th-century occupations. Each skill has a growth rate, diminishing returns threshold, and outcome effects that reward mastery. Skills cover all primary activities: agriculture, resource extraction, crafting, combat, trade, and spiritual pursuits. The set is broad enough that no single entity masters everything, creating natural specialization.

**Why this priority**: Skills gate recipe access, influence job scoring, and drive entity specialization. Without defined skills, the skill system has nothing to measure.

**Independent Test**: Load the skill registry. Verify each entry has valid `baseGrowthPerCompletion`, `diminishingReturnsThreshold`, and at least one `outcomeEffect`. Verify every recipe skill requirement references a skill in this registry.

**Skill Registry**:

| Skill ID | Name | Base Growth | Dim. Threshold | Dim. Factor | Outcome Effects |
|---|---|---|---|---|---|
| farming | Farming | 3.0 | 50 | 0.5 | speedMultiplier: 0.6 at 100 |
| mining | Mining | 2.5 | 50 | 0.5 | speedMultiplier: 0.5 at 100, outputBonus: +1 ore |
| woodcutting | Woodcutting | 3.0 | 50 | 0.5 | speedMultiplier: 0.6 at 100 |
| masonry | Masonry | 2.0 | 50 | 0.5 | speedMultiplier: 0.5 at 100, outputBonus: +1 block |
| smithing | Smithing | 2.0 | 60 | 0.4 | speedMultiplier: 0.5 at 100, outputBonus: +1 item |
| carpentry | Carpentry | 2.5 | 50 | 0.5 | speedMultiplier: 0.5 at 100 |
| weaving | Weaving | 2.5 | 50 | 0.5 | speedMultiplier: 0.5 at 100 |
| tailoring | Tailoring | 2.5 | 50 | 0.5 | speedMultiplier: 0.5 at 100 |
| leatherworking | Leatherworking | 2.5 | 50 | 0.5 | speedMultiplier: 0.5 at 100 |
| baking | Baking | 3.0 | 50 | 0.5 | speedMultiplier: 0.6 at 100, outputBonus: +1 loaf |
| brewing | Brewing | 2.5 | 50 | 0.5 | speedMultiplier: 0.5 at 100 |
| cooking | Cooking | 3.0 | 50 | 0.5 | speedMultiplier: 0.6 at 100 |
| fishing | Fishing | 3.0 | 40 | 0.5 | speedMultiplier: 0.5 at 100, outputBonus: +1 fish |
| herbalism | Herbalism | 2.0 | 50 | 0.5 | speedMultiplier: 0.5 at 100, outputBonus: +1 herb |
| animal_husbandry | Animal Husbandry | 2.5 | 50 | 0.5 | speedMultiplier: 0.5 at 100 |
| trading | Trading | 2.0 | 60 | 0.4 | Improved trade evaluation accuracy |
| combat | Combat | 2.0 | 60 | 0.4 | speedMultiplier: 0.5 at 100 |
| construction | Construction | 2.5 | 50 | 0.5 | speedMultiplier: 0.5 at 100 |
| hauling | Hauling | 3.5 | 40 | 0.5 | speedMultiplier: 0.4 at 100 |
| preaching | Preaching | 2.0 | 60 | 0.4 | faith.bonus +5 at 100 |
| glassblowing | Glassblowing | 1.5 | 60 | 0.4 | speedMultiplier: 0.4 at 100, outputBonus: +1 pane |

**Acceptance Scenarios**:

1. **Given** an entity with Smithing 0 completing a smithing job, **When** skill growth is applied, **Then** the skill increases by `baseGrowthPerCompletion × aptitudeMultiplier` (3.0 × 1.0 = 2.0 before trait modifiers).
2. **Given** an entity with Smithing 65 (above diminishing threshold 60), **When** completing a smithing job, **Then** growth is reduced by the diminishing factor (0.4).
3. **Given** an entity with Baking 100, **When** performing a baking recipe, **Then** the recipe duration is reduced by 60% (speedMultiplier 0.6) and output may include +1 bonus loaf.
4. **Given** every recipe skill requirement in the recipe catalog, **When** cross-referenced with this registry, **Then** every referenced skill ID exists.
5. **Given** the full skill set, **When** counted, **Then** at least 20 distinct skills exist, covering agriculture, crafting, combat, trade, and social domains.

---

### User Story 7 — Trait Catalog (Priority: P1)

Traits (spec 020) add personality and mechanical differentiation to entities. Each trait provides one or more modifiers: skill aptitudes (growth rate and starting bonus), performance modifiers (work speed, output), and need modifiers (hunger/rest/social decay rates). Traits are assigned at entity creation (1-3 per procedurally generated entity) and remain fixed. The catalog provides enough variety that two entities of the same prototype feel distinct.

**Why this priority**: Traits are the primary source of entity individuality. Without them, all Blacksmiths are identical.

**Independent Test**: Load the trait registry. Verify each trait has at least one modifier. Verify skill IDs in `skillAptitude` modifiers match the skill catalog. Verify need IDs in `needModifier` entries match the need catalog.

**Trait Registry — Skill Aptitude Traits**:

| Trait ID | Name | Modifier Type | Details |
|---|---|---|---|
| born_baker | Born Baker | skillAptitude | baking: growthMultiplier 1.5, startingValueBonus +10 |
| natural_smith | Natural Smith | skillAptitude | smithing: growthMultiplier 1.5, startingValueBonus +10 |
| green_thumb | Green Thumb | skillAptitude | farming: growthMultiplier 1.5, startingValueBonus +10 |
| steady_hand | Steady Hand | skillAptitude | carpentry: growthMultiplier 1.3, startingValueBonus +5; masonry: growthMultiplier 1.3, startingValueBonus +5 |
| silver_tongue | Silver Tongue | skillAptitude | trading: growthMultiplier 1.5, startingValueBonus +10 |
| iron_constitution | Iron Constitution | skillAptitude | mining: growthMultiplier 1.3, startingValueBonus +5; combat: growthMultiplier 1.2 |
| keen_eye | Keen Eye | skillAptitude | fishing: growthMultiplier 1.4, startingValueBonus +5; herbalism: growthMultiplier 1.3 |
| nimble_fingers | Nimble Fingers | skillAptitude | weaving: growthMultiplier 1.4, startingValueBonus +5; tailoring: growthMultiplier 1.4, startingValueBonus +5 |
| devout_soul | Devout Soul | skillAptitude | preaching: growthMultiplier 1.5, startingValueBonus +10 |
| animal_friend | Animal Friend | skillAptitude | animal_husbandry: growthMultiplier 1.5, startingValueBonus +10 |
| quick_learner | Quick Learner | skillAptitude | ALL skills: growthMultiplier 1.2 (no starting bonus) |
| slow_learner | Slow Learner | skillAptitude | ALL skills: growthMultiplier 0.7 (no starting bonus) |

**Trait Registry — Performance Modifier Traits**:

| Trait ID | Name | Modifier Type | Details |
|---|---|---|---|
| strong | Strong | performanceModifier | hauling: multiplier 1.3; construction: multiplier 1.2; mining: multiplier 1.2 |
| weak | Weak | performanceModifier | hauling: multiplier 0.7; construction: multiplier 0.8; mining: multiplier 0.8 |
| quick | Quick | performanceModifier | ALL work: multiplier 1.15 (overall speed boost) |
| slow | Slow | performanceModifier | ALL work: multiplier 0.85 (overall speed penalty) |
| meticulous | Meticulous | performanceModifier | ALL crafting: outputBonus +0.5 (50% chance of extra output), speedMultiplier 0.9 (slightly slower) |
| clumsy | Clumsy | performanceModifier | ALL crafting: outputBonus -0.3 (30% chance of wasted attempt), speedMultiplier 1.1 (slightly faster) |
| hardy | Hardy | performanceModifier | combat: multiplier 1.2; construction: multiplier 1.15 |

**Trait Registry — Need Modifier Traits**:

| Trait ID | Name | Modifier Type | Details |
|---|---|---|---|
| tireless | Tireless | needModifier | rest: decay rate × 0.7 (needs less sleep) |
| lethargic | Lethargic | needModifier | rest: decay rate × 1.4 (tires quickly) |
| hearty | Hearty | needModifier | hunger: decay rate × 0.7 (needs less food) |
| ravenous | Ravenous | needModifier | hunger: decay rate × 1.4 (always hungry) |
| gregarious | Gregarious | needModifier | social: decay rate × 1.3 (craves company); social: satisfaction bonus × 1.3 |
| solitary | Solitary | needModifier | social: decay rate × 0.6 (content alone); social: satisfaction bonus × 0.7 |
| devout | Devout | needModifier | faith: decay rate × 1.3 (needs regular worship); faith: satisfaction bonus × 1.5 |
| skeptical | Skeptical | needModifier | faith: decay rate × 0.5 (indifferent to religion); faith: satisfaction bonus × 0.5 |
| brave | Brave | needModifier | safety: decay rate × 0.6 (less afraid) |
| cowardly | Cowardly | needModifier | safety: decay rate × 1.5 (easily frightened) |
| generous | Generous | needModifier | mood: bonus +3 after giving (gift, charity) |
| miserly | Miserly | needModifier | mood: bonus +3 from accumulating currency |

**Acceptance Scenarios**:

1. **Given** a procedurally generated entity, **When** assigned traits "Born Baker" and "Tireless", **Then** the entity has baking growthMultiplier 1.5, starting baking +10, and rest decay × 0.7.
2. **Given** trait "Strong" applied to a hauling task, **When** the entity hauls materials, **Then** hauling performance is multiplied by 1.3 (carries loads faster/more).
3. **Given** trait "Quick Learner", **When** the entity completes any skill-granting work, **Then** growth is multiplied by 1.2 across all skills.
4. **Given** every trait in the registry, **When** its modifiers are validated, **Then** all referenced skill IDs and need IDs exist in their respective catalogs.
5. **Given** traits "Strong" and "Weak", **When** assigned to different entities of the same prototype, **Then** their hauling and construction performance differs meaningfully.

---

### User Story 8 — Need Catalog (Priority: P1)

Every humanoid entity has a set of needs that decay over time and must be satisfied to maintain mood and productivity (spec 013). The need set is grounded in the realities of 13th-century life: food and drink, sleep, personal safety, community bonds, physical comfort, and spiritual devotion. Each need has a configurable decay rate, critical threshold, and one or more satisfaction methods tied to furniture, zones, or consumable items.

**Why this priority**: Needs drive entity behavior through the AI system. Without defined needs, entities have no internal motivation.

**Independent Test**: Load the need registry. Verify each need has a decay rate, critical threshold, and at least one satisfaction method referencing valid items, furniture, or zones.

**Need Registry**:

| Need ID | Name | Decay Rate (per tick) | Critical Threshold | Satisfaction Methods |
|---|---|---|---|---|
| hunger | Hunger | 0.15 | 20% | Consume any `food` category item; quality varies by item (Bread = +30, Stew = +50, Pottage = +35, Roast Meat = +55, Porridge = +25, Cheese = +20, Dried Meat = +20, Fruit = +15) |
| rest | Rest | 0.10 | 20% | Sleep in bed furniture; restoration rate: Straw Pallet = +0.8/tick, Wooden Bed = +1.2/tick, Noble Bed = +1.5/tick |
| safety | Safety | 0.05 | 20% | Proximity to Guard entities (within 10 tiles); presence in enclosed room with door; Guard Post zone bonus (+10) |
| social | Social | 0.08 | 15% | Conversation with another entity (both entities gain +15); gathering in Great Hall (+20); gathering in Tavern (+15) |
| comfort | Comfort | 0.06 | 15% | Sitting in Chair/Bench (+10/+5); presence near Hearth (+8); sleeping in quality bed (Noble Bed +5 bonus); room with Tapestry (+3) |
| faith | Faith | 0.04 | 10% | Prayer at Altar (+20); attending preaching at Lectern (+25); presence in Chapel (+10 passive); presence in Church (+20 passive) |

**Need Satisfaction Priority** (default, per spec 013):

| Occupation | Priority Order (highest first) |
|---|---|
| Default (all) | Hunger > Rest > Safety > Social > Comfort > Faith |
| Guard | Safety > Rest > Hunger > Social > Comfort > Faith |
| Merchant | Social > Hunger > Rest > Comfort > Safety > Faith |
| Priest/Monk | Faith > Social > Hunger > Rest > Comfort > Safety |
| Noble | Comfort > Social > Hunger > Rest > Safety > Faith |
| Farmer | Hunger > Rest > Safety > Social > Comfort > Faith |

**Acceptance Scenarios**:

1. **Given** an entity with Hunger at 18% (below critical 20%), **When** the behavior tree evaluates, **Then** satisfying Hunger becomes the highest-priority goal.
2. **Given** an entity consuming Bread, **When** the food is consumed, **Then** Hunger need increases by +30 (clamped to 100%).
3. **Given** an entity sleeping in a Wooden Bed, **When** rest ticks, **Then** Rest need recovers at +1.2 per tick until full.
4. **Given** an entity in a Chapel zone with an Altar, **When** the entity prays, **Then** Faith need increases by +20.
5. **Given** a Priest entity, **When** its need priority order is queried, **Then** Faith is the highest priority, followed by Social.

---

### User Story 9 — Job Type Catalog (Priority: P1)

The job system (spec 017) uses job types to define what work entities can perform. Each job type references an activity, a skill domain, required tools (if any), and the zone or workstation context where the work occurs. Job types cover all economic activities in the settlement — from farming and mining to crafting and trading. Some jobs are recurring (farming cycles, patrol routes); others are one-time (build a wall, fill a trade order).

**Why this priority**: Jobs are the connection between entity labor and production output. Without job type definitions, the job board system has nothing to post.

**Independent Test**: Load the job type registry. Verify each references valid skill IDs, tool material IDs, and zone types.

**Job Type Registry**:

| Job Type ID | Name | Skill Domain | Tool Required | Zone Context | Recurrence | Notes |
|---|---|---|---|---|---|---|
| farm.sow | Sow Crops | farming | Hoe | Farm Field | One-time per season | Plant seeds in tilled soil |
| farm.tend | Tend Crops | farming | — | Farm Field | Recurring | Water, weed, care for growing crops |
| farm.harvest | Harvest Crops | farming | Sickle | Farm Field | One-time per season | Collect mature crops |
| mine.ore | Mine Ore | mining | Pickaxe | Mine (underground) | Recurring | Extract iron, copper, tin, coal |
| quarry.stone | Quarry Stone | masonry | Pickaxe | Quarry | Recurring | Extract limestone, granite |
| fell.trees | Fell Trees | woodcutting | Axe | Forest (map edge) | Recurring | Harvest wood logs |
| fish.catch | Catch Fish | fishing | Fishing Rod | Fishing Dock | Recurring | Catch raw fish |
| gather.herbs | Gather Herbs | herbalism | — | Herb Garden / wild | Recurring | Collect medicinal herbs |
| tend.animals | Tend Livestock | animal_husbandry | — | Pasture | Recurring | Feed, shear, milk animals |
| tend.bees | Tend Apiary | animal_husbandry | — | Apiary Yard | Recurring | Harvest honey and beeswax |
| craft.produce | Craft / Produce | (per recipe) | (per recipe) | (per recipe zone) | Recurring | Execute any crafting recipe |
| haul.deliver | Haul Materials | hauling | — | Any | Recurring | Move items between inventories |
| build.construct | Build Structure | construction | Iron Hammer | Any | One-time | Execute construction job (spec 016) |
| build.deconstruct | Deconstruct | construction | Iron Hammer | Any | One-time | Remove structure (spec 016) |
| guard.patrol | Patrol Area | combat | (any weapon) | Guard Post / settlement | Recurring | Walk patrol route, detect threats |
| guard.watch | Stand Watch | combat | (any weapon) | Guard Post | Recurring | Stationary guard duty |
| trade.sell | Sell Goods | trading | — | Market | Recurring | Merchant sells to buyers |
| trade.buy | Purchase Goods | trading | — | Market | One-time | Buyer-initiated trade (spec 019) |
| preach.sermon | Deliver Sermon | preaching | — | Chapel / Church | Recurring | Priest preaches to congregation |
| preach.pray | Personal Prayer | preaching | — | Chapel / Church | Recurring | Individual devotion |
| diplomacy.dispatch | Diplomatic Mission | trading | — | Throne Room → target | One-time | Envoy delivery (spec 021) |
| haul.bury | Bury Deceased | hauling | — | Cemetery | One-time | Transport body to gravesite |

**Acceptance Scenarios**:

1. **Given** a `farm.harvest` job posted on a Farm Field job board, **When** an entity with a Sickle and Farming skill claims it, **Then** the job executes and produces crop materials.
2. **Given** a `craft.produce` job for recipe "Bake Bread", **When** cross-referenced, **Then** it requires an Oven in a Bakery zone and references the Baking skill.
3. **Given** a `guard.patrol` job, **When** claimed by a Guard entity, **Then** the entity uses its equipped weapon and follows a patrol route within the settlement.
4. **Given** all job type IDs, **When** checked against skill IDs and tool material IDs, **Then** every reference is valid.
5. **Given** job types with `Recurring` recurrence, **When** a recurring job completes, **Then** it auto-re-posts on the job board (while the board is active).

---

### User Story 10 — Terrain Type Catalog (Priority: P1)

The game map (spec 004) uses terrain types that define traversability, visual identity, and resource availability. Terrain types reflect a 13th-century European landscape: fertile farmland, dense forest, rocky highlands, water features, and roads. Each terrain type declares whether it is traversable, whether it can be built upon, and what resources (if any) can be harvested from it.

**Why this priority**: Terrain shapes the physical world. Without terrain definitions, map generation and pathfinding have no data to work with.

**Independent Test**: Load the terrain type registry. Verify each has valid `traversable`, `buildable`, and optional `harvestable` properties.

**Terrain Type Registry**:

| Terrain ID | Name | Traversable | Buildable | Harvestable Resource | Notes |
|---|---|---|---|---|---|
| grassland | Grassland | Yes | Yes | — | Default open terrain; suitable for farming |
| fertile_soil | Fertile Soil | Yes | Yes | Wheat, Barley, Rye, Vegetables | Required for Farm Field zones |
| forest_oak | Oak Forest | Yes (slow) | No (must clear) | Oak Log, Oak Bark | Dense; reduces movement speed |
| forest_pine | Pine Forest | Yes (slow) | No (must clear) | Pine Log | Dense; reduces movement speed |
| forest_birch | Birch Forest | Yes (slow) | No (must clear) | Birch Log | Lighter forest |
| rocky | Rocky Ground | Yes | Yes | — | Rough terrain, no farming |
| stone_deposit | Stone Deposit | Yes | No | Limestone, Granite | Quarry source |
| ore_vein | Ore Vein | Yes | No | Iron Ore, Copper Ore, Tin Ore, Coal | Mine source |
| water_shallow | Shallow Water | No | No | Raw Fish | Fishing source; impassable |
| water_deep | Deep Water | No | No | — | Impassable |
| marsh | Marshland | Yes (very slow) | No | Herbs | Difficult terrain; herb gathering |
| road_dirt | Dirt Road | Yes (fast) | No | — | Faster movement |
| road_stone | Stone Road | Yes (fast) | No | — | Fastest movement; requires construction |
| sand | Sandy Ground | Yes | Yes | Sand | Beach or riverbank |
| vineyard_soil | Vineyard Soil | Yes | Yes | Grapes | Required for Vineyard zones |
| orchard_soil | Orchard Soil | Yes | Yes | Fruit | Required for Orchard zones |
| clay_deposit | Clay Deposit | Yes | No | Clay | Ceramic material source |
| mountain | Mountain | No | No | — | Impassable; map boundary |
| wall | Wall (built) | No | No | — | Constructed barrier |
| floor_wood | Wooden Floor | Yes | Yes | — | Interior construction |
| floor_stone | Stone Floor | Yes | Yes | — | Interior construction |

**Acceptance Scenarios**:

1. **Given** terrain type `forest_oak`, **When** an entity pathfinds through it, **Then** movement speed is reduced (slow traversal modifier).
2. **Given** terrain type `ore_vein`, **When** a Mine Ore job is posted on it, **Then** the harvestable resources include Iron Ore, Copper Ore, Tin Ore, and Coal.
3. **Given** terrain type `water_shallow`, **When** checked for traversability, **Then** it is impassable (traversable = No), but a Fishing Dock zone can be adjacent.
4. **Given** terrain type `road_stone`, **When** an entity pathfinds along it, **Then** movement speed is increased (fast traversal modifier).
5. **Given** terrain type `forest_oak` with `buildable: No`, **When** a construction job targets a forest tile, **Then** the tree must be cleared (Fell Trees job) before construction can proceed.

---

### User Story 11 — Animal & Livestock Prototypes (Priority: P2)

The game world includes domesticated livestock and wild animals. Livestock are entities that live in Pastures, produce resources (wool, milk, eggs, meat), and are tended by entities with Animal Husbandry skill. Wild animals exist on forest and wilderness tiles and may be hunted for hides and meat, or may pose threats to the settlement. Animals are ECS entities with Position, Inventory (for products), and simple behavior trees.

**Why this priority**: Animals add economic depth (wool, milk, meat production) and environmental flavor. P2 because the core economy functions with farming and crafting alone.

**Independent Test**: Load all animal prototypes. Verify each has valid components (Position, Inventory) and a behavior tree reference. Verify livestock produce materials that exist in the material catalog.

**Livestock Prototypes**:

| Prototype | Products | Tending Skill | Zone | Behavior | Notes |
|---|---|---|---|---|---|
| Sheep | Raw Wool (shearing, periodic) | Animal Husbandry | Pasture | Graze, wander within zone | Primary wool source |
| Cow | Milk (milking, periodic), Raw Meat (butcher) | Animal Husbandry | Pasture | Graze, wander within zone | Dairy and meat |
| Goat | Milk (milking, periodic), Raw Hide (butcher) | Animal Husbandry | Pasture | Graze, wander within zone | Hardy dairy animal |
| Pig | Raw Meat (butcher), Tallow (butcher) | Animal Husbandry | Pasture | Forage, wander | Meat and fat |
| Chicken | Eggs → Food item (periodic) | Animal Husbandry | Pasture | Peck, wander | Daily food source |
| Horse | — (mount/draft, future) | Animal Husbandry | Pasture | Graze, wander | Transport (future); prestige |
| Donkey | — (pack animal, future) | Animal Husbandry | Pasture | Graze, wander | Hauling aid (future) |

**Wild Animal Prototypes**:

| Prototype | Drops on Hunt | Habitat | Behavior | Threat Level |
|---|---|---|---|---|
| Deer | Raw Meat, Raw Hide | Forest | Flee from entities | None (flees) |
| Rabbit | Raw Meat | Grassland, Forest edge | Flee | None |
| Boar | Raw Meat, Raw Hide, Tallow | Forest | Aggressive if cornered | Medium |
| Wolf | Raw Hide | Forest, Mountain edge | Hunts in packs, attacks livestock | High |
| Bear | Raw Meat, Raw Hide | Deep forest | Territorial, attacks if provoked | Very High |
| Fox | Raw Hide | Forest, Grassland | Steals chickens if unguarded | Low |

**Acceptance Scenarios**:

1. **Given** a Sheep entity in a Pasture zone, **When** a Tend Livestock job completes (shearing), **Then** Raw Wool is added to the shearer's inventory or the nearest storage.
2. **Given** a Cow entity, **When** a milking job completes, **Then** Milk is produced. **When** a butchering job is performed instead, **Then** Raw Meat is produced and the Cow entity is destroyed.
3. **Given** a Wolf entity in a forest adjacent to a Pasture, **When** no Guard entity is within detection range, **Then** the Wolf may pathfind toward livestock and attack.
4. **Given** a Deer entity, **When** a humanoid approaches within detection range, **Then** the Deer flees in the opposite direction.
5. **Given** a Fox entity near an unguarded Chicken, **When** the Fox's behavior tree evaluates, **Then** it may steal the Chicken (remove entity).

---

### User Story 12 — Guild Faction Catalog (Priority: P2)

The 13th-century setting features a guild system (spec 021) where craftsmen organize into occupational factions. Each guild is a Faction entity with type `occupational`, a defined leader role (Guild Master), and membership drawn from entities practicing the relevant trade. Guilds influence trade (members get preferential pricing), labor (guilds post jobs on their own boards), and social standing. The catalog defines the initial set of guilds for a typical settlement.

**Why this priority**: Guilds add social structure and economic texture. P2 because factions are functional without specific guild content; the faction system works with any faction data.

**Independent Test**: Load guild faction prototypes. Verify each has valid `factionType: occupational`, a leader role, and membership criteria referencing valid skill IDs.

**Guild Faction Catalog**:

| Faction ID | Name | Type | Membership Criterion | Leader Title | Disposition | Notes |
|---|---|---|---|---|---|---|
| guild_bakers | Baker's Guild | occupational | Baking skill ≥ 15 | Master Baker | mercantile | Controls bread production quality |
| guild_smiths | Blacksmith's Guild | occupational | Smithing skill ≥ 15 | Master Smith | mercantile | Metalwork and toolmaking |
| guild_masons | Mason's Guild | occupational | Masonry skill ≥ 15 | Master Mason | isolationist | Stonework and construction |
| guild_carpenters | Carpenter's Guild | occupational | Carpentry skill ≥ 15 | Master Carpenter | mercantile | Woodwork and building |
| guild_weavers | Weaver's Guild | occupational | Weaving skill ≥ 15 | Master Weaver | mercantile | Textiles and cloth |
| guild_tanners | Tanner's Guild | occupational | Leatherworking skill ≥ 15 | Master Tanner | isolationist | Leather processing |
| guild_brewers | Brewer's Guild | occupational | Brewing skill ≥ 15 | Master Brewer | mercantile | Ale, mead, wine production |
| guild_merchants | Merchant's Guild | occupational | Trading skill ≥ 15 | Guildmaster | mercantile | Trade and commerce |
| guild_potters | Potter's Guild | occupational | Masonry skill ≥ 10 (ceramics) | Master Potter | mercantile | Pottery and brickwork |

**Guild Mechanics** (how guilds interact with existing systems):

- **Trade benefit**: Members of the same guild trading with each other receive a `priceMultiplier` discount (e.g., 0.85×) on top of any faction standing bonus.
- **Job boards**: Each guild may sponsor a job board in the settlement, posting guild-specific jobs (e.g., Baker's Guild posts baking jobs with familiarity tags).
- **Membership**: Entities automatically qualify for guild membership when their relevant skill crosses the threshold. Joining is a choice (the entity or player assigns faction membership), not automatic.
- **Standing**: Guilds start at neutral (0) standing with each other. Trade and cooperation raise standing; competition or resource conflicts may lower it.

**Acceptance Scenarios**:

1. **Given** a Blacksmith entity with Smithing skill 20, **When** the player assigns them to the Blacksmith's Guild, **Then** the entity's `factions` component includes `guild_smiths`.
2. **Given** two members of the Baker's Guild trading with each other, **When** a trade offer is evaluated, **Then** the seller's effective `priceMultiplier` includes the guild discount.
3. **Given** the Merchant's Guild faction entity, **When** its leader (Guildmaster) is queried, **Then** a specific entity with Trading skill is designated as leader.
4. **Given** the Mason's Guild with `isolationist` disposition, **When** NPC faction AI evaluates diplomatic options, **Then** the guild is less likely to initiate trade agreements or overtures.
5. **Given** nine guilds loaded, **When** the faction registry is queried for `factionType: occupational`, **Then** exactly nine entries are returned.

---

### User Story 13 — Religious Faction Catalog (Priority: P2)

Religious life is central to 13th-century Europe. The game includes religious factions — each a Faction entity with type `religious`. Religious factions influence faith need satisfaction, provide unique social dynamics, and may interact with guilds and the player's government through diplomacy. The catalog defines three distinct religious factions representing the diversity of medieval Christian religious life.

**Why this priority**: Religion adds thematic depth and ties into the faith need, Chapel/Church zones, and Preaching skill. P2 because the faith need can function with generic religious content; distinct factions add flavor.

**Independent Test**: Load religious faction prototypes. Verify each has valid `factionType: religious`, a leader role, and effects that reference valid need IDs and zone types.

**Religious Faction Catalog**:

| Faction ID | Name | Type | Leader Title | Disposition | Membership | Zones Associated | Notes |
|---|---|---|---|---|---|---|---|
| parish_church | The Parish | religious | Parish Priest | mercantile | Priest entities; any devout citizen | Chapel, Church | Local spiritual authority; community worship; collects tithes |
| monastic_order | Monastic Order | religious | Abbot | isolationist | Monk entities | Cloister, Church, Brewery, Herb Garden | Scholarly, brewing, herbalism; cloistered life |
| mendicant_friars | Mendicant Friars | religious | Prior | mercantile | Friar entities (variant of Priest) | Chapel (traveling), Market | Traveling preachers; charity to poor; no fixed monastery |

**Religious Faction Mechanics**:

- **Faith bonus**: Entities who are members of a religious faction receive an additional faith satisfaction bonus when worshipping in that faction's associated zones. A member of The Parish gains extra faith in a Church; a Monk gains extra faith in a Cloister.
- **Tithes**: The Parish may collect periodic currency from members (configurable tithe rate) deposited into the faction leader's inventory or a designated Coffer in the Church.
- **Charity**: Mendicant Friars distribute food or currency to entities whose mood or wealth is critically low. This is a job type (`charity.distribute`) posted on their faction board.
- **Scholarship**: Monastic Order members may produce Parchment and maintain the Scriptorium, providing a scholarship activity that could unlock future content.
- **Diplomacy**: Religious factions participate in the diplomacy system (spec 021). The Parish is typically aligned with the player's government. The Monastic Order is self-sufficient and neutral. Mendicant Friars are friendly to all but may conflict with wealthy guilds.

**Acceptance Scenarios**:

1. **Given** a Priest entity who is a member of The Parish, **When** praying at a Church Altar, **Then** faith satisfaction includes a faction membership bonus on top of the base Altar bonus.
2. **Given** the Monastic Order faction, **When** its `disposition` is checked, **Then** it is `isolationist`, making it less likely to initiate diplomatic overtures.
3. **Given** a Mendicant Friar entity, **When** an entity in the settlement has mood below 15%, **Then** the Friar's behavior tree triggers a charity distribution job.
4. **Given** three religious factions loaded, **When** the faction registry is queried for `factionType: religious`, **Then** exactly three entries are returned.
5. **Given** The Parish faction's leader (Parish Priest) is located in the Church, **When** a Diplomatic Envoy from another faction is dispatched to The Parish, **Then** the Envoy pathfinds to the Parish Priest's current location.

---

### User Story 14 — Behavior Tree Templates (Priority: P2)

The behavior system (spec 013) uses behavior trees combined with utility scoring. This catalog defines the standard behavior tree templates that drive daily life in the settlement. Each template is a named tree of sequence, selector, and action nodes. Templates cover the universal daily routine, work cycles, need satisfaction, guard duties, and social interactions. These are loaded as behavior plugins and assigned to entity prototypes.

**Why this priority**: Behavior trees are the bridge between entity needs/skills and world actions. P2 because a minimal tree (need satisfaction + work) is sufficient for an MVP; the full set adds richness.

**Independent Test**: Load all behavior tree templates. Verify each has valid node structure (depth ≤ 5 levels). Verify all referenced actions (e.g., `consumeFood`, `sleepInBed`) correspond to defined system actions.

**Behavior Tree Templates**:

**1. `daily_routine` — Universal Daily Cycle** (assigned to all humanoids)

```
Selector
├── Sequence: Critical Needs
│   ├── Condition: any need below critical threshold
│   └── Action: satisfy_critical_need (utility-scored: pick most urgent)
├── Sequence: Work Cycle
│   ├── Condition: job available on claimed board
│   ├── Action: travel_to_worksite
│   ├── Action: gather_materials (if needed)
│   └── Action: perform_work
├── Sequence: Social & Comfort
│   ├── Condition: social or comfort below 40%
│   └── Selector
│       ├── Action: seek_conversation (travel to nearest idle entity)
│       └── Action: seek_comfort (travel to Hearth, Chair, Great Hall)
├── Sequence: Faith
│   ├── Condition: faith below 30% AND religious faction member
│   └── Action: attend_worship (travel to Chapel/Church, pray)
└── Action: idle_wander (wander settlement, minor tasks)
```

**2. `worker_cycle` — Generic Work Execution** (sub-tree, called by daily_routine)

```
Sequence
├── Action: claim_job (query job board, select highest-scored)
├── Selector: Gather Required
│   ├── Condition: all materials at worksite
│   └── Sequence
│       ├── Action: query_nearest_material (material query, spec 018)
│       ├── Action: travel_to_source
│       ├── Action: pick_up_materials
│       ├── Action: travel_to_worksite
│       └── Action: deposit_materials
├── Selector: Gather Tool
│   ├── Condition: required tool in inventory
│   └── Sequence
│       ├── Action: query_nearest_tool
│       ├── Action: travel_to_tool
│       └── Action: pick_up_tool
├── Action: perform_work (tick-based, skill growth on completion)
└── Action: deliver_output (to stockpile or specified destination)
```

**3. `guard_patrol` — Guard Behavior** (assigned to Guard/Soldier prototypes)

```
Selector
├── Sequence: Threat Response
│   ├── Condition: hostile entity detected within range
│   ├── Action: alert_nearby_guards
│   └── Action: engage_threat (move to target, combat)
├── Sequence: Patrol Route
│   ├── Condition: patrol job active
│   ├── Action: travel_to_next_waypoint
│   └── Action: scan_area (detect hostiles, check livestock safety)
├── Sequence: Watch Duty
│   ├── Condition: watch job active
│   └── Action: stand_watch (stationary scan at Guard Post)
└── Fallback: daily_routine (when no guard duties)
```

**4. `merchant_routine` — Merchant Behavior** (assigned to Merchant prototype)

```
Selector
├── Sequence: Open Shop
│   ├── Condition: Market zone available AND daytime
│   ├── Action: travel_to_market
│   └── Action: await_trade_offers (passive; responds to trade.offer.proposed)
├── Sequence: Restock
│   ├── Condition: inventory below restock threshold
│   ├── Action: query_available_goods (from production zones)
│   ├── Action: travel_to_source
│   └── Action: purchase_restock (trade with producers)
└── Fallback: daily_routine
```

**5. `priest_routine` — Religious Leader Behavior** (assigned to Priest/Monk)

```
Selector
├── Sequence: Scheduled Service
│   ├── Condition: sermon time AND Chapel/Church available
│   ├── Action: travel_to_pulpit (Lectern)
│   └── Action: deliver_sermon (duration, satisfies faith for attendees)
├── Sequence: Tend Faithful
│   ├── Condition: entity with low mood nearby
│   └── Action: seek_conversation (counseling variant; mood bonus)
├── Sequence: Monastic Work (Monks only)
│   ├── Condition: Monk AND Cloister/Brewery/Herb Garden available
│   └── Action: perform_work (brewing, herbalism, or scholarship)
└── Fallback: daily_routine
```

**6. `livestock_behavior` — Animal Behavior** (assigned to livestock)

```
Selector
├── Sequence: Feed
│   ├── Condition: hunger below threshold
│   └── Action: eat_from_trough (travel to Trough, consume)
├── Sequence: Graze
│   ├── Condition: in Pasture zone
│   └── Action: wander_within_zone (random movement)
├── Sequence: Flee
│   ├── Condition: threat detected (Wolf, Boar)
│   └── Action: flee_from_threat (move away from threat entity)
└── Action: idle_stand
```

**7. `predator_behavior` — Wild Predator Behavior** (assigned to Wolf, Boar, Bear)

```
Selector
├── Sequence: Hunt
│   ├── Condition: prey detected within range (livestock, Rabbit, Deer)
│   ├── Action: stalk_prey (move toward prey)
│   └── Action: attack_prey
├── Sequence: Territorial
│   ├── Condition: humanoid entity within territory
│   └── Selector
│       ├── Condition: aggressive (Bear, cornered Boar)
│       │   └── Action: attack_intruder
│       └── Action: flee_from_intruder (Wolf retreats from groups)
└── Action: wander_territory
```

**Acceptance Scenarios**:

1. **Given** the `daily_routine` tree assigned to a Peasant entity, **When** Hunger drops below critical threshold, **Then** the Critical Needs branch activates and the entity seeks food before doing any work.
2. **Given** the `guard_patrol` tree assigned to a Guard entity, **When** a Wolf entity enters detection range, **Then** the Threat Response branch activates and the Guard moves to engage.
3. **Given** the `merchant_routine` tree, **When** a Merchant's inventory falls below restock threshold, **Then** the Restock branch activates and the Merchant travels to purchase goods.
4. **Given** all behavior tree templates, **When** node depth is checked, **Then** no tree exceeds 5 levels of nesting.
5. **Given** the `livestock_behavior` tree assigned to a Sheep, **When** a Wolf approaches, **Then** the Flee branch activates and the Sheep moves away.

---

### Edge Cases

- What if a material is referenced by a recipe but missing from the catalog? → The recipe fails validation at load time; the game logs an error and the recipe is disabled.
- What if a workstation required by a recipe does not exist in the furniture catalog? → Same as above; recipe disabled with error log.
- What if an entity prototype references a skill or trait that does not exist? → The entity loads with that skill/trait silently defaulted to 0/empty. A validation warning is logged.
- What if all livestock of a type are butchered and no more can be obtained? → The player must trade with merchants or other factions who may sell livestock. No spontaneous generation of animals.
- What if a guild has no members (all members died or left)? → The guild faction entity persists but is functionally inactive (no job board postings, no trade discount). A new entity meeting the skill threshold can be assigned.
- What if a religious faction's leader dies? → The faction becomes leaderless (spec 021); no diplomatic dispatches received; a new leader must be assigned by the player or faction AI.
- What if two recipes produce the same output material? → Both are valid. The production system selects based on workstation availability, material availability, and player preference.
- What if a terrain type is cleared (forest → grassland) but no replacement terrain type is defined? → Forest clearing yields Grassland terrain by default. The cleared terrain becomes buildable.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The material registry MUST contain at least 70 distinct material entries spanning categories: raw, processed, food, drink, tool, weapon, armor, clothing, currency, building, textile, fuel, metal, animal, plant, and religious.
- **FR-002**: The recipe registry MUST contain at least 55 distinct crafting recipes forming multi-tier production chains (minimum 3 tiers from raw resource to finished good for at least 3 chains: metal, textile, food).
- **FR-003**: The furniture catalog MUST contain at least 50 distinct entity prototypes across categories: workstation, storage, comfort, religious, utility, and decorative. Every workstation referenced by any recipe MUST have a corresponding prototype.
- **FR-004**: The zone type catalog MUST contain at least 25 distinct zone types, including at least 10 production zones (rooms), at least 4 storage zones, at least 4 living/social zones, at least 3 religious zones, and at least 6 open-air zones.
- **FR-005**: The humanoid entity prototype catalog MUST contain at least 20 distinct prototypes with differentiated starting skills, default equipment, and optional faction membership.
- **FR-006**: The skill registry MUST contain at least 20 distinct skills, each with valid growth parameters, diminishing returns configuration, and at least one outcome effect.
- **FR-007**: The trait registry MUST contain at least 24 distinct traits across three modifier types: `skillAptitude`, `performanceModifier`, and `needModifier`.
- **FR-008**: The need registry MUST define at least 6 needs (hunger, rest, safety, social, comfort, faith), each with configurable decay rate, critical threshold, and satisfaction methods tied to consumable items, furniture, or zones in this catalog.
- **FR-009**: The job type registry MUST contain at least 20 distinct job types covering farming, mining, crafting, hauling, construction, guarding, trading, and religious activities. Each job type MUST reference valid skill IDs and tool material IDs from this catalog.
- **FR-010**: The terrain type registry MUST contain at least 15 distinct terrain types with defined traversability, buildability, and optional harvestable resources.
- **FR-011**: The animal prototype catalog MUST contain at least 6 livestock types and at least 5 wild animal types, each with defined products/drops, habitat terrain, and behavior tree reference.
- **FR-012**: The guild faction catalog MUST contain at least 8 occupational faction prototypes with defined skill-based membership criteria, leader titles, and disposition.
- **FR-013**: The religious faction catalog MUST contain at least 3 religious faction prototypes with distinct dispositions, associated zone types, and faith-related mechanics.
- **FR-014**: The behavior tree template catalog MUST contain at least 6 templates: a universal daily routine, a work cycle, a guard behavior, a merchant behavior, a religious leader behavior, and a livestock behavior. All trees MUST respect the depth limit (≤ 5 levels).
- **FR-015**: All catalog entries MUST cross-reference consistently — no material, skill, trait, zone, furniture, or faction ID may be referenced without a corresponding definition in its registry.
- **FR-016**: All numeric values (stack limits, decay rates, growth rates, recipe durations, need thresholds) MUST be defined as game configuration data, not hardcoded. Designers MUST be able to tune them without code changes.
- **FR-017**: All content MUST be thematically consistent with a European 13th-century setting without reference to a specific country. No anachronistic items (gunpowder, printing press, potatoes, etc.).

### Key Entities

- **Material**: An entry in the material registry. Defines a type of item that can be stored, traded, consumed, or used in crafting. Characterized by name, categories, stack limit, weight, optional perishability, and base trade value.
- **Recipe**: A crafting transformation entry. Defines inputs, outputs, duration, workstation/room/skill restrictions, and skill experience awarded on completion.
- **Furniture Prototype**: An entity prototype for a placeable world object. Has Position, optional Inventory, category tags, construction material requirements, and functional effects.
- **Zone Type**: A spatial definition that designates a set of tiles as a functional area. Declares room requirements, minimum size, furniture prerequisites, effects, and profession affinity.
- **Humanoid Prototype**: An entity prototype for a person. Has Position, Inventory, TaskQueue, starting skills, default traits, equipment, faction membership, and needs.
- **Animal Prototype**: An entity prototype for livestock or wild animals. Has Position, optional Inventory (products), behavior tree, products/drops, and habitat terrain.
- **Skill Entry**: A skill registry record defining growth parameters, diminishing returns, and outcome effects.
- **Trait Entry**: A trait registry record defining one or more modifiers (skill aptitude, performance, need).
- **Need Entry**: A need registry record defining decay rate, critical threshold, and satisfaction methods.
- **Job Type Entry**: A job type registry record defining activity, skill domain, tool requirements, zone context, and recurrence.
- **Terrain Type Entry**: A terrain type registry record defining traversability, buildability, and harvestable resources.
- **Guild Faction**: A Faction entity prototype with type `occupational`, membership criteria, leader role, and disposition.
- **Religious Faction**: A Faction entity prototype with type `religious`, associated zones, leader role, and spiritual mechanics.
- **Behavior Tree Template**: A named, loadable behavior tree definition with sequence/selector/action nodes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All content registries load without validation errors — zero cross-reference mismatches across materials, recipes, furniture, zones, skills, traits, needs, jobs, terrain, and factions.
- **SC-002**: At least 3 complete production chains of depth ≥ 3 exist and function end-to-end: a raw resource is harvested, processed through intermediary steps, and results in a finished good usable by entities or tradeable.
- **SC-003**: Every zone type in the catalog can be constructed and activated using only materials and furniture defined in this catalog — no external dependencies.
- **SC-004**: Every humanoid prototype, when instantiated, has a functional daily routine: can satisfy needs, claim jobs, and perform work using content defined in this catalog.
- **SC-005**: The guild and religious faction catalogs integrate with the diplomacy system (spec 021): factions have leaders, standings, and can participate in diplomatic acts.
- **SC-006**: At least 70% of materials in the catalog participate in at least one crafting recipe (as input or output) — no more than 30% are terminal (consumed directly or harvested only).
- **SC-007**: The behavior tree templates, when assigned to their target entity prototypes, produce observable autonomous behavior in simulation: entities eat, sleep, work, socialize, and worship without player intervention.
- **SC-008**: Content variety is sufficient that two randomly generated settlements (using different PRNG seeds, spec 011) produce noticeably different economic compositions based on terrain, entity prototypes assigned, and trait distributions.

## Assumptions

- **This catalog defines the initial content set, not a closed set**: All registries are open (per their respective system specs). Future content can extend every catalog without changing this spec. This spec defines the baseline that ships at launch.
- **Numeric values are representative, not final**: Stack limits, decay rates, growth rates, recipe durations, need thresholds, and standing effects are designer-tunable game data (FR-016). The values in this spec are informed starting points.
- **No specific country**: The setting draws broadly from 13th-century Western European culture — English, French, German, and Italian influences blended. No named countries, cities, or historical figures.
- **No magic or supernatural elements**: The setting is grounded in historical realism. Religious faith is a social and psychological need, not a source of supernatural power.
- **No gunpowder, no printing press, no New World crops**: Strictly pre-14th-century technology and agriculture. Potatoes, tomatoes, maize, tobacco, and chocolate do not exist. Glass is rare and expensive.
- **Silver Penny as standard currency**: Based on the historical English penny (denarius). No complex coinage system — one denomination simplifies trade (spec 019).
- **Guild membership is voluntary**: Entities qualify by skill threshold but must be assigned (by player or AI) to join. Guilds do not enforce monopolies — non-guild entities can perform guild trades, but without guild trade discounts.
- **Religious factions are all Christian variants**: Consistent with 13th-century Western Europe. No pagan or non-Christian religions in the initial catalog, though the open set allows future expansion.
- **Animal breeding is out of scope**: Livestock are placed or traded, not bred. Population dynamics for animals may be a future feature.
- **Seasons are implicit**: Farm jobs reference "per season" recurrence but the seasonal cycle system itself is not defined in this spec. Farming jobs assume a grow → harvest cycle exists.
