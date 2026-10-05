import { z } from "zod";
import type { JsonValue } from "../engine/EventBus";
import { SaveSectionLocation } from "../save/SaveSectionRegistry";
import type { SaveSection } from "../save/SaveSectionRegistry";
import { recentRetentionTicks, SiteKind, SiteStatus } from "./constructionTypes";
import type { RecentJob } from "./constructionTypes";

const recentSchema = z
  .object({
    jobId: z.number().int().min(1),
    kind: z.nativeEnum(SiteKind),
    prototypeId: z.string().min(1),
    status: z.enum([SiteStatus.Done, SiteStatus.Cancelled]),
    mapId: z.number().int().min(0),
    cellIndex: z.number().int().min(0),
    finishedTick: z.number().int().min(0),
  })
  .strict();

const constructionSectionSchema = z.object({ recent: z.array(recentSchema) }).strict();

/**
 * Per-engine construction state that is not on entities: the jobs that finished lately (done or
 * cancelled), kept for {@link recentRetentionTicks} ticks for the queue view (DECISIONS D-27).
 * Saved in the section `systems.construction`.
 */
export class ConstructionService {
  private list: RecentJob[] = [];

  /**
   * Remembers a finished job.
   *
   * @param job - The job; its status must be `Done` or `Cancelled`.
   */
  remember(job: RecentJob): void {
    this.list.push({ ...job });
  }

  /**
   * Forgets jobs that finished {@link recentRetentionTicks} ticks ago or earlier.
   *
   * @param tick - The current tick.
   * @returns How many were dropped.
   */
  prune(tick: number): number {
    const before = this.list.length;
    this.list = this.list.filter((job) => tick - job.finishedTick < recentRetentionTicks);
    return before - this.list.length;
  }

  /**
   * The recently finished jobs, oldest first.
   *
   * @returns Copies.
   */
  recent(): RecentJob[] {
    return this.list.map((job) => ({ ...job }));
  }

  /**
   * The save section `systems.construction`: the recently finished jobs.
   *
   * @returns The section for `registerSystem({ saveSection })`.
   */
  createSection(): SaveSection {
    return {
      key: "construction",
      location: SaveSectionLocation.Systems,
      schema: constructionSectionSchema,
      serialize: (): JsonValue => ({ recent: this.list.map((job) => ({ ...job })) }),
      restore: (saved: JsonValue) => {
        this.list = constructionSectionSchema.parse(saved).recent;
      },
      defaultForOlderSaves: () => ({ recent: [] }),
    };
  }
}
