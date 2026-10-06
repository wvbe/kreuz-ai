import { z } from "zod";
import type { JsonValue } from "../../game/engine/EventBus";

const progressSchema = z.object({
  tier: z.string(),
  settlementNoun: z.string(),
  tierReachedAtTick: z.record(z.string(), z.number()),
  nextTier: z.string().nullable(),
  nextSettlementNoun: z.string().nullable(),
  requirements: z.array(
    z.object({ met: z.boolean(), current: z.number(), target: z.number(), label: z.string() }),
  ),
  milestones: z.array(z.object({ milestone: z.string() })),
  evaluations: z.number(),
  lastEvaluationTick: z.number().nullable(),
});

const unlockSchema = z.object({
  contentKind: z.string(),
  contentId: z.string(),
  name: z.string(),
  unlockTier: z.string(),
  unlocked: z.boolean(),
  lockText: z.string().nullable(),
});

const milestoneSchema = z.object({
  milestone: z.string(),
  reached: z.boolean(),
  tick: z.number().nullable(),
  subjectIds: z.array(z.number()),
});

/**
 * Formats the `settlement-progress` query for the `tier` verb: the tier with its noun, when each
 * tier was reached, then the checklist of the next tier (`[x]` met, `[ ]` open, with the current
 * and target values) and the evaluation counters.
 *
 * @param view - Data of the `settlement-progress` query.
 * @returns Output lines; empty for a foreign view or no game.
 */
export function formatTier(view: JsonValue): string[] {
  const parsed = progressSchema.safeParse(view);
  if (!parsed.success) {
    return [];
  }
  const data = parsed.data;
  const reached = Object.entries(data.tierReachedAtTick)
    .map(([tier, tick]) => `${tier} at tick ${tick}`)
    .join(", ");
  const lines = [`tier: ${data.tier} (a ${data.settlementNoun}); reached: ${reached}`];
  if (data.nextTier === null) {
    lines.push("this is the highest tier");
  } else {
    lines.push(`next tier: ${data.nextTier} (a ${data.nextSettlementNoun}) needs:`);
    for (const requirement of data.requirements) {
      lines.push(`  [${requirement.met ? "x" : " "}] ${requirement.label}`);
    }
  }
  lines.push(
    `evaluated ${data.evaluations} time(s), last at tick ${data.lastEvaluationTick ?? "-"}; milestones reached: ${data.milestones.length}`,
  );
  return lines;
}

/**
 * Formats the `unlocks` query for the `unlocks` verb: one line per entry with its kind, id, name
 * and either the tier it needs and `Unlocks at <Tier>` (locked) or `unlocked`.
 *
 * @param view - Data of the `unlocks` query.
 * @returns Output lines; a note when nothing matches; empty for a foreign view.
 */
export function formatUnlocks(view: JsonValue): string[] {
  const parsed = z.array(unlockSchema).safeParse(view);
  if (!parsed.success) {
    return [];
  }
  if (parsed.data.length === 0) {
    return ["nothing matches"];
  }
  return parsed.data.map(
    (row) =>
      `${row.unlocked ? "unlocked" : "LOCKED  "} ${row.contentKind} ${row.contentId} (${row.name}) needs ${row.unlockTier}${row.lockText === null ? "" : `: ${row.lockText}`}`,
  );
}

/**
 * Formats the `milestones` query for the `milestones` verb: every milestone with the tick and
 * subjects of the ones reached.
 *
 * @param view - Data of the `milestones` query.
 * @returns Output lines; empty for a foreign view.
 */
export function formatMilestones(view: JsonValue): string[] {
  const parsed = z.array(milestoneSchema).safeParse(view);
  if (!parsed.success) {
    return [];
  }
  return parsed.data.map((row) =>
    row.reached
      ? `${row.milestone}: reached at tick ${row.tick ?? 0}${row.subjectIds.length === 0 ? "" : ` (${row.subjectIds.map((id) => `#${id}`).join(", ")})`}`
      : `${row.milestone}: not yet`,
  );
}
