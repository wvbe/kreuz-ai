/**
 * Id of the gathering system (dependency name for systems that read crop plots).
 */
export const gatheringSystemId = "gathering";

/**
 * Job type id of sowing one field cell (`jobs.json`).
 */
export const sowJobId = "farm.sow";

/**
 * Job type id of harvesting one ripe field cell (`jobs.json`).
 */
export const harvestJobId = "farm.harvest";

/**
 * Job type id of mining one charge of an iron ore deposit (`jobs.json`).
 */
export const mineOreJobId = "mine.ore";

/**
 * Job type id of quarrying one charge of a stone deposit (`jobs.json`).
 */
export const quarryStoneJobId = "quarry.stone";

/**
 * Zone type id of crop fields (`zones.json`).
 */
export const farmFieldZoneTypeId = "farm_field";

/**
 * Terrain a crop grows on: only fertile cells of a field hold a crop plot.
 */
export const fertileTerrainId = "fertile_soil";

/**
 * Terrain of an ore deposit (mined by `mine.ore`).
 */
export const oreTerrainId = "iron_ore_deposit";

/**
 * Terrain of a stone deposit (quarried by `quarry.stone`).
 */
export const stoneTerrainId = "stone_deposit";

/**
 * Material the ore auto-poster watches (output of `mine.ore`).
 */
export const oreMaterialId = "iron_ore";

/**
 * Material the quarry auto-poster watches (output of `quarry.stone`).
 */
export const stoneMaterialId = "limestone";

/**
 * Base work time of sowing one cell, ticks.
 */
export const sowBaseTicks = 12;

/**
 * Base work time of harvesting one cell, ticks.
 */
export const harvestBaseTicks = 18;

/**
 * Base work time of one mining charge, ticks.
 */
export const mineBaseTicks = 36;

/**
 * Base work time of one quarry charge, ticks.
 */
export const quarryBaseTicks = 30;

/**
 * The gathering auto-posters look every this many ticks (one game hour).
 */
export const gatheringPosterIntervalTicks = 12;

/**
 * Most active postings of one gathering job type the auto-posters keep, over all boards.
 */
export const gatheringMaxActivePostings = 4;

/**
 * Most active `mine.ore` (and, separately, `quarry.stone`) postings: fewer than the farm jobs so
 * a few miners at a time leave the others to haul, craft and build.
 */
export const depositMaxActivePostings = 4;

/**
 * Cells further than this path cost from a board are not posted (about 40 normal cells).
 */
export const gatheringRadiusCost = 400;

/**
 * Growth of a crop is counted in milli-ticks: a normal tick adds this much (the season modifier
 * of the tick scales it, `seasonModifier` returns permille of it).
 */
export const normalGrowthMilli = 1000;

/**
 * Event: a sown crop became ripe (`{mapId, cellIndex, materialId}`).
 */
export const cropRipenedEvent = "gathering.crop.ripened";

/**
 * Event: a deposit ran out and its cell changed terrain (`{mapId, cellIndex, terrainId}`).
 */
export const depositDepletedEvent = "gathering.deposit.depleted";

/**
 * Growth stage of a crop plot. The enum value is the serialized stage. `Fallow` is the state of
 * a fertile field cell without a plot record; only `Sown` and `Ripe` plots are stored.
 */
export enum CropStage {
  Fallow = "Fallow",
  Sown = "Sown",
  Ripe = "Ripe",
}

/**
 * The stored data of one sown or ripe cell.
 */
export type CropPlot = {
  mapId: number;
  cellIndex: number;
  /**
   * The crop: the material the cell yields when harvested.
   */
  materialId: string;
  stage: CropStage.Sown | CropStage.Ripe;
  /**
   * Growth so far in milli-ticks.
   */
  growthMilli: number;
};

/**
 * The charges left of a partly worked deposit cell (an untouched deposit has no record).
 */
export type DepositRecord = {
  mapId: number;
  cellIndex: number;
  remaining: number;
};

/**
 * One cell in the `crops` query.
 */
export type CropView = {
  readonly zoneId: number;
  readonly mapId: number;
  readonly cellIndex: number;
  readonly materialId: string;
  readonly stage: CropStage;
  /**
   * Growth in permille of the growth time (0 for a fallow cell, 1000 when ripe).
   */
  readonly growthPermille: number;
  /**
   * Ticks until ripe at normal growth speed, or null when the cell is not growing.
   */
  readonly ticksToRipe: number | null;
};
