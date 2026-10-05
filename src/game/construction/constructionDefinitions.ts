import { SettlementTier } from "../content/contentTypes";
import type { FurnitureContent } from "../content/schemas/economySchemas";
import type { GameEngine } from "../engine/GameEngine";
import { getJobService } from "../jobs/jobServiceRegistry";
import { tierOrder } from "../jobs/JobService";
import { doorPrototypeId, furniturePiecePrototypeId, wallPrototypeId } from "./constructionTypes";
import type { SiteMaterial } from "./constructionTypes";

/**
 * The build definition of a building (spec 016, plan 3.5): the furniture record of the content
 * pack (walls and doors are records of the same table).
 *
 * @param engine - The engine with the content.
 * @param prototypeId - Furniture, wall or door id.
 * @returns The record, or undefined when the pack has none.
 */
export function findBuildDefinition(
  engine: GameEngine,
  prototypeId: string,
): FurnitureContent | undefined {
  return engine.content.furniture.find(prototypeId);
}

/**
 * The materials a building needs, as fresh copies.
 *
 * @param definition - The build definition.
 * @returns One entry per material, in the order of the record.
 */
export function requiredMaterials(definition: FurnitureContent): SiteMaterial[] {
  return definition.constructionMaterials.map((item) => ({ ...item }));
}

/**
 * The base work ticks of taking a building down: half of the construction ticks, at least 1
 * (DECISIONS D-27).
 *
 * @param definition - The build definition.
 * @returns Whole ticks at skill 0.
 */
export function deconstructionTicks(definition: FurnitureContent): number {
  return Math.max(1, Math.floor(definition.constructionTicks / 2));
}

/**
 * The tier that unlocks a definition: its `unlockTier`, or `hamlet` when it has none.
 *
 * @param definition - The build definition.
 * @returns A `SettlementTier` value.
 */
export function unlockTierOf(definition: FurnitureContent): string {
  return definition.unlockTier ?? SettlementTier.Hamlet;
}

/**
 * Whether the settlement has reached the tier of a definition. The tier in force is the job
 * service's tier source (the game's `startingTier` option until the settlement tiers of task 4.4
 * set one).
 *
 * @param engine - The engine.
 * @param definition - The build definition.
 * @returns True when the definition may be placed.
 */
export function isUnlocked(engine: GameEngine, definition: FurnitureContent): boolean {
  return (
    tierOrder.indexOf(getJobService(engine).currentTier()) >=
    tierOrder.indexOf(unlockTierOf(definition))
  );
}

/**
 * The text a locked definition shows: `Unlocks at <Tier>` with the tier id in title case
 * (`market_town` gives `Market Town`).
 *
 * @param tier - A `SettlementTier` value.
 * @returns The text for the build menu.
 */
export function unlockText(tier: string): string {
  const name = tier
    .split("_")
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(" ");
  return `Unlocks at ${name}`;
}

/**
 * The prototype to spawn when a building is finished: the engine prototype with the id of the
 * definition (`oven`, `chest`, `wall`, `door` ...), or the `furniture_piece` placeholder carrying
 * the `Furniture` component for furniture that has no prototype of its own.
 *
 * @param engine - The engine.
 * @param prototypeId - Furniture, wall or door id.
 * @returns The prototype id and the component overrides for `EntityStore.spawn`.
 */
export function builtPrototype(
  engine: GameEngine,
  prototypeId: string,
): { prototypeId: string; overrides: { [component: string]: { [field: string]: string } } } {
  if (
    prototypeId === wallPrototypeId ||
    prototypeId === doorPrototypeId ||
    engine.prototypes.has(prototypeId)
  ) {
    return { prototypeId, overrides: {} };
  }
  return {
    prototypeId: furniturePiecePrototypeId,
    overrides: { Furniture: { furnitureId: prototypeId } },
  };
}
