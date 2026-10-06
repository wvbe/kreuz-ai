import { z } from "zod";
import type { JsonValue } from "../../game/engine/EventBus";

const summarySchema = z.object({
  id: z.number(),
  level: z.string(),
  active: z.boolean(),
  capacity: z.number(),
  residents: z.array(z.number()),
  rentPerDay: z.number(),
  upgradeStreak: z.number(),
  downgradeStreak: z.number(),
  tiles: z.number(),
});

const totalsSchema = z.object({
  dwellings: z.number(),
  activeDwellings: z.number(),
  housed: z.number(),
  homeless: z.number(),
  freeSlots: z.number(),
  perLevel: z.record(z.string(), z.number()),
  immigrationBlocked: z.string().nullable(),
});

const requirementSchema = z.object({ met: z.boolean(), label: z.string() });

const levelSchema = z.object({
  level: z.string(),
  met: z.boolean(),
  requirements: z.array(requirementSchema),
});

const dwellingSchema = summarySchema.extend({
  mapId: z.number(),
  hasStorage: z.boolean(),
  nextLevel: z.string().nullable(),
  current: levelSchema,
  next: levelSchema.nullable(),
  upgradeGraceDays: z.number(),
  downgradeGraceDays: z.number(),
  foods: z.array(z.string()),
  accumulators: z.record(z.string(), z.number()),
});

function people(ids: readonly number[]): string {
  return ids.length === 0 ? "nobody" : ids.map((id) => `#${id}`).join(", ");
}

/**
 * Formats the queries `housing` and `dwellings` for the `homes` verb: the totals (dwellings,
 * housed, homeless, free slots, active dwellings per level, why settlers cannot come) and one line
 * per dwelling with level, residents, rent and both streaks.
 *
 * @param totals - Data of the `housing` query.
 * @param rows - Data of the `dwellings` query.
 * @returns Output lines; empty for a foreign view.
 */
export function formatHomes(totals: JsonValue, rows: JsonValue): string[] {
  const parsedTotals = totalsSchema.safeParse(totals);
  const parsedRows = z.array(summarySchema).safeParse(rows);
  if (!parsedTotals.success || !parsedRows.success) {
    return [];
  }
  const data = parsedTotals.data;
  const levels = Object.entries(data.perLevel)
    .map(([level, count]) => `${level} ${count}`)
    .join(", ");
  const lines = [
    `housing: ${data.dwellings} dwelling(s), ${data.activeDwellings} active; ${data.housed} housed, ${data.homeless} homeless, ${data.freeSlots} free slot(s); ${levels}`,
  ];
  if (data.immigrationBlocked !== null) {
    lines.push(`settlers cannot come: ${data.immigrationBlocked}`);
  }
  for (const row of parsedRows.data) {
    lines.push(
      `#${row.id} ${row.level} ${row.active ? "active" : "INACTIVE"}: ${row.residents.length}/${row.capacity} residents (${people(row.residents)}), ${row.tiles} tiles, rent ${row.rentPerDay}/day, streaks up ${row.upgradeStreak} down ${row.downgradeStreak}`,
    );
  }
  return lines;
}

/**
 * Formats the query `dwelling {id}` for the `home` verb: the dwelling's level and household, both
 * streaks against their grace days, the checklist of its current level (a failing item starts the
 * downgrade countdown) and of the next level (what stops the upgrade), and the foods eaten lately.
 *
 * @param view - Data of the `dwelling` query.
 * @returns Output lines; empty for a foreign view or an entity that is no dwelling.
 */
export function formatHome(view: JsonValue): string[] {
  const parsed = dwellingSchema.safeParse(view);
  if (!parsed.success) {
    return [];
  }
  const data = parsed.data;
  const lines = [
    `dwelling #${data.id}: ${data.level}, ${data.active ? "active" : "INACTIVE"}, ${data.residents.length} of ${data.capacity} resident(s) (${people(data.residents)}), ${data.tiles} tiles, rent ${data.rentPerDay}/day${data.hasStorage ? "" : ", no storage"}`,
    `upgrade streak ${data.upgradeStreak}/${data.upgradeGraceDays}${data.nextLevel === null ? " (top level)" : ` (to ${data.nextLevel})`}, downgrade streak ${data.downgradeStreak}/${data.downgradeGraceDays}`,
    `${data.level} (current level) ${data.current.met ? "holds" : "FAILS"}:`,
  ];
  for (const entry of data.current.requirements) {
    lines.push(`  [${entry.met ? "x" : " "}] ${entry.label}`);
  }
  if (data.next !== null) {
    lines.push(`${data.next.level} (next level) ${data.next.met ? "holds" : "needs:"}`);
    for (const entry of data.next.requirements) {
      lines.push(`  [${entry.met ? "x" : " "}] ${entry.label}`);
    }
  }
  lines.push(`foods eaten lately: ${data.foods.length === 0 ? "none" : data.foods.join(", ")}`);
  return lines;
}
