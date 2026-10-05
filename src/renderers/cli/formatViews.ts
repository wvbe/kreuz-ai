import { z } from "zod";
import type { EventRecord } from "../../game/api/CommandResult";
import type { JsonValue } from "../../game/engine/EventBus";
import type { EntityDetailView, EntityListView, StateView } from "../../game/api/Views";

/**
 * Most events a command summary prints before it says how many more there were.
 */
export const maxPrintedEvents = 10;

/**
 * Formats the hour of day as `HH:00`.
 *
 * @param hour - Hour of day, 0 to 23.
 * @returns Two-digit hour with minutes.
 */
export function formatClock(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/**
 * Formats the `state` view for the `status` verb.
 *
 * @param state - The state view.
 * @returns Output lines.
 */
export function formatStatus(state: StateView): string[] {
  if (!state.hasGame) {
    return ["no game: start one with `new [seed] [difficulty] [mapSize]` or `load <file>`"];
  }
  const { time } = state;
  return [
    `tick ${time.tick}  day ${time.day}  ${formatClock(time.hourOfDay)}  ${time.paused ? "paused" : "running"}  speed ${time.speed}  interval ${time.tickIntervalMs}ms`,
    `seed ${state.seed}  difficulty ${state.difficulty}  tier ${state.startingTier ?? "-"}`,
    `entities ${state.entityCount}  maps ${state.mapCount}  pending commands ${state.pendingCommandCount}`,
  ];
}

/**
 * Formats events, one per line, capped at {@link maxPrintedEvents}.
 *
 * @param events - Event records, oldest first.
 * @param limit - Print at most this many (the newest ones).
 * @returns Output lines.
 */
export function formatEvents(events: readonly EventRecord[], limit = maxPrintedEvents): string[] {
  const shown = events.slice(Math.max(0, events.length - limit));
  const lines = shown.map(
    (event) => `  [${event.seq}] t${event.tick} ${event.name} ${JSON.stringify(event.payload)}`,
  );
  return events.length > shown.length
    ? [`  ... ${events.length - shown.length} earlier events not shown`, ...lines]
    : lines;
}

/**
 * Formats an entity list page.
 *
 * @param list - The `entities` view.
 * @param names - Styled names by entity id (from `identity-of`); named entities print theirs.
 * @returns Output lines.
 */
export function formatEntityList(
  list: EntityListView,
  names: ReadonlyMap<number, string> = new Map(),
): string[] {
  if (list.entities.length === 0) {
    return [`no entities (total ${list.total})`];
  }
  return [
    `entities ${list.offset + 1}-${list.offset + list.entities.length} of ${list.total}`,
    ...list.entities.map((entity) => {
      const name = names.get(entity.id);
      return `  #${entity.id} ${entity.prototype}${name === undefined ? "" : ` ${name}`}`;
    }),
  ];
}

/**
 * Formats one entity with all of its components.
 *
 * @param detail - The entity view, or null when it does not exist.
 * @param id - The id that was asked for (used in the not-found message).
 * @returns Output lines.
 */
export function formatEntityDetail(detail: EntityDetailView | null, id: number): string[] {
  if (detail === null) {
    return [`no entity #${id}`];
  }
  const names = Object.keys(detail.components).sort();
  return [
    `#${detail.id} ${detail.prototype}`,
    ...names.map((name) => `  ${name}: ${JSON.stringify(detail.components[name])}`),
  ];
}

const skillsSummarySchema = z.object({
  dominantSkill: z.string().nullable(),
  skills: z.array(z.object({ skillId: z.string(), level: z.number() })),
});

const traitsSummarySchema = z.object({
  traits: z.array(z.object({ name: z.string(), effects: z.array(z.string()) })),
});

/**
 * Formats the `skills-of` and `traits-of` query results for `inspect`: one line with the skills
 * above level 0 (and the dominant one) and one line with the traits and their effects. Results
 * that are not those views (entity without skills, query failure) print nothing.
 *
 * @param skills - Data of the `skills-of` query, or null.
 * @param traits - Data of the `traits-of` query, or null.
 * @returns Output lines, possibly none.
 */
export function formatCharacter(skills: JsonValue, traits: JsonValue): string[] {
  const lines: string[] = [];
  const parsedSkills = skillsSummarySchema.safeParse(skills);
  if (parsedSkills.success) {
    const known = parsedSkills.data.skills.filter((row) => row.level > 0);
    const list =
      known.length === 0 ? "none" : known.map((row) => `${row.skillId} ${row.level}`).join(", ");
    const dominant = parsedSkills.data.dominantSkill;
    lines.push(`  skills: ${list}${dominant === null ? "" : ` (dominant: ${dominant})`}`);
  }
  const parsedTraits = traitsSummarySchema.safeParse(traits);
  if (parsedTraits.success) {
    const list = parsedTraits.data.traits.map(
      (trait) => `${trait.name} (${trait.effects.join("; ")})`,
    );
    lines.push(`  traits: ${list.length === 0 ? "none" : list.join(", ")}`);
  }
  return lines;
}

const identitySummarySchema = z.object({ styledName: z.string() });

const membershipSummarySchema = z.object({
  factions: z.array(z.object({ id: z.number(), name: z.string() })),
});

/**
 * Reads the styled name out of an `identity-of` query result.
 *
 * @param identity - Data of the `identity-of` query, or null.
 * @returns The styled name, or null for anything that is not an identity view.
 */
export function styledNameOf(identity: JsonValue): string | null {
  const parsed = identitySummarySchema.safeParse(identity);
  return parsed.success ? parsed.data.styledName : null;
}

/**
 * Formats the `identity-of` and `faction-of` query results for `inspect`: the styled name and the
 * factions the entity belongs to. Results that are not those views print nothing.
 *
 * @param identity - Data of the `identity-of` query, or null.
 * @param membership - Data of the `faction-of` query, or null.
 * @returns Output lines, possibly none.
 */
export function formatIdentity(identity: JsonValue, membership: JsonValue): string[] {
  const lines: string[] = [];
  const name = styledNameOf(identity);
  if (name !== null) {
    lines.push(`  name: ${name}`);
  }
  const parsed = membershipSummarySchema.safeParse(membership);
  if (parsed.success && parsed.data.factions.length > 0) {
    lines.push(
      `  factions: ${parsed.data.factions.map((faction) => `#${faction.id} ${faction.name}`).join(", ")}`,
    );
  }
  return lines;
}
