/**
 * Terrain ids the world generators paint with. They are ids of the bundled content pack
 * (`terrain.json`); a pack that lacks one cannot be used with `newGame({ mapSize })`.
 */
export enum WorldTerrain {
  Grassland = "grassland",
  FertileSoil = "fertile_soil",
  ForestOak = "forest_oak",
  WaterShallow = "water_shallow",
  StoneDeposit = "stone_deposit",
  IronOreDeposit = "iron_ore_deposit",
  Mountain = "mountain",
  RockWall = "rock_wall",
  FloorWood = "floor_wood",
  RoadDirt = "road_dirt",
  ForestPine = "forest_pine",
  ForestBirch = "forest_birch",
  Rocky = "rocky",
  OreVein = "ore_vein",
  WaterDeep = "water_deep",
  Marsh = "marsh",
  Sand = "sand",
  VineyardSoil = "vineyard_soil",
  OrchardSoil = "orchard_soil",
  ClayDeposit = "clay_deposit",
  CaveFloor = "cave_floor",
}
