import type { ContentRegistries } from "../content/ContentRegistries";
import type { JobTypeContent } from "../content/schemas/economySchemas";
import { ZoneContextKind } from "../content/contentTypes";
import type { GameEngine } from "../engine/GameEngine";
import { fellTreesJobId } from "../jobs/fellTrees";
import { mineOreJobId, quarryStoneJobId } from "./gatheringTypes";

const cache = new WeakMap<ContentRegistries, readonly JobTypeContent[]>();

/**
 * The terrain gathering jobs of the content pack: jobs whose zone context is a terrain and that
 * list outputs, except the three older ones with their own rules (`fell.trees`, `mine.ore`,
 * `quarry.stone`). They are `fell.pine`, `fell.birch`, `dig.clay`, `gather.sand`, `mine.vein` and
 * `quarry.granite` in the shipped pack (DECISIONS D-130).
 *
 * @param engine - The engine.
 * @returns The job types in file order.
 */
export function terrainGatherJobs(engine: GameEngine): readonly JobTypeContent[] {
  const known = cache.get(engine.content);
  if (known !== undefined) {
    return known;
  }
  const legacy = [fellTreesJobId, mineOreJobId, quarryStoneJobId];
  const found = engine.content.jobs
    .all()
    .filter(
      (job) =>
        job.onBoard &&
        job.zoneContext.kind === ZoneContextKind.Terrain &&
        job.outputs.length > 0 &&
        !legacy.includes(job.id),
    );
  cache.set(engine.content, found);
  return found;
}

/**
 * The terrain gathering job that works a terrain.
 *
 * @param engine - The engine.
 * @param terrainId - Terrain id.
 * @returns The job type, or undefined when no such job exists.
 */
export function terrainJobAt(engine: GameEngine, terrainId: string): JobTypeContent | undefined {
  return terrainGatherJobs(engine).find((job) => job.zoneContext.ref === terrainId);
}
