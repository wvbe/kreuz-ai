import { z } from "zod";
import type { JsonValue } from "../../game/engine/EventBus";

const momentSchema = z.object({
  momentId: z.number(),
  tick: z.number(),
  day: z.number(),
  kind: z.string(),
  prominence: z.string(),
  entityId: z.number().nullable(),
  text: z.string(),
});

const chronicleSchema = z.object({
  total: z.number(),
  capacity: z.number(),
  moments: z.array(momentSchema),
});

const journalSchema = z.object({
  entityId: z.number(),
  capacity: z.number(),
  entries: z.array(momentSchema),
});

function line(moment: z.infer<typeof momentSchema>): string {
  const mark = moment.prominence === "major" ? "*" : " ";
  return `${mark} day ${moment.day}, tick ${moment.tick}: ${moment.text}`;
}

/**
 * Formats the `chronicle` query for the `chronicle` verb: the count line and one line per moment,
 * newest first, Major moments marked with `*`.
 *
 * @param view - Data of the `chronicle` query.
 * @returns Output lines; empty for a foreign view or no game.
 */
export function formatChronicle(view: JsonValue): string[] {
  const parsed = chronicleSchema.safeParse(view);
  if (!parsed.success) {
    return [];
  }
  const { total, capacity, moments } = parsed.data;
  return [
    `chronicle: ${moments.length} of ${total} entries (it keeps ${capacity})`,
    ...moments.map((moment) => `  ${line(moment)}`),
  ];
}

/**
 * Formats the `journal` query for the `journal` verb: the count line and one line per entry,
 * oldest first.
 *
 * @param view - Data of the `journal` query.
 * @returns Output lines; empty for a foreign view or an entity without a journal.
 */
export function formatJournal(view: JsonValue): string[] {
  const parsed = journalSchema.safeParse(view);
  if (!parsed.success) {
    return [];
  }
  const { entityId, capacity, entries } = parsed.data;
  return [
    `journal of #${entityId}: ${entries.length} of ${capacity} entries`,
    ...entries.map((entry) => `  ${line(entry)}`),
  ];
}

/**
 * The last entries of a journal for `inspect`: `  journal:` followed by up to `count` lines,
 * oldest of the shown first. A citizen without entries or without a journal gives nothing.
 *
 * @param view - Data of the `journal` query, or null.
 * @param count - How many entries to show at most.
 * @returns Output lines, possibly none.
 */
export function formatJournalTail(view: JsonValue, count: number): string[] {
  const parsed = journalSchema.safeParse(view);
  if (!parsed.success || parsed.data.entries.length === 0) {
    return [];
  }
  return [
    "  journal:",
    ...parsed.data.entries.slice(-count).map((entry) => `    day ${entry.day}: ${entry.text}`),
  ];
}
