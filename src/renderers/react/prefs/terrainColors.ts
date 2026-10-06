/**
 * Terrain colour table of the map renderer (spec 024 FR-003): terrain id to 0xRRGGBB. It is a
 * renderer preference, not game data: the engine knows nothing about colours.
 */
export const terrainColors: ReadonlyMap<string, number> = new Map([
  ["grassland", 0x7aa84f],
  ["fertile_soil", 0x6b4f2d],
  ["forest_oak", 0x2f6b35],
  ["water_shallow", 0x3d7fc4],
  ["stone_deposit", 0x9b9ba3],
  ["mountain", 0x7d7d85],
  ["rock_wall", 0x55555b],
  ["iron_ore_deposit", 0x8d5f4c],
  ["cave_floor", 0x4a4540],
  ["floor_wood", 0xa57c4f],
  ["road_dirt", 0xb59a6a],
]);

/**
 * Colour of the terrain ids the table does not know (content packs may add terrain).
 */
export const unknownTerrainColor = 0xff00ff;

/**
 * The colour of a terrain id.
 *
 * @param terrainId - Terrain id as the `map` view reports it.
 * @returns A 0xRRGGBB colour; {@link unknownTerrainColor} for an unknown id.
 */
export function terrainColor(terrainId: string): number {
  return terrainColors.get(terrainId) ?? unknownTerrainColor;
}

/**
 * Overlay colours per zone type id (translucent when drawn).
 */
export const zoneColors: ReadonlyMap<string, number> = new Map([
  ["stockpile", 0xd9a441],
  ["pantry", 0xe8c26a],
  ["farm_field", 0x8fd14f],
  ["bakery", 0xe58a4d],
  ["bedroom", 0x6f8fe0],
  ["dwelling", 0x4fb3a6],
  ["throne_room", 0xb066d9],
  ["bell_tower", 0xd9d441],
]);

/**
 * Overlay colour of a zone type.
 *
 * @param zoneTypeId - Zone type id.
 * @returns A 0xRRGGBB colour; white for an unknown type.
 */
export function zoneColor(zoneTypeId: string): number {
  return zoneColors.get(zoneTypeId) ?? 0xffffff;
}
