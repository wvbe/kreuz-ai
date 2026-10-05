import type { EventRecord } from "../../game/api/CommandResult";
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
 * @returns Output lines.
 */
export function formatEntityList(list: EntityListView): string[] {
  if (list.entities.length === 0) {
    return [`no entities (total ${list.total})`];
  }
  return [
    `entities ${list.offset + 1}-${list.offset + list.entities.length} of ${list.total}`,
    ...list.entities.map((entity) => `  #${entity.id} ${entity.prototype}`),
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
