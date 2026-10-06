import type { JsonValue } from "../../../game/engine/EventBus";
import { useQuery } from "../engine/useGameState";

/**
 * Runs a query and returns its view, or null when the query failed (no game, bad arguments).
 * The caller states the view type it expects, imported type-only from the game module.
 *
 * @param name - The query name.
 * @param args - Query arguments as JSON.
 * @returns The view or null.
 */
export function useView<View>(name: string, args?: JsonValue): View | null {
  const state = useQuery<View>(name, args);
  return state.ok ? state.data : null;
}
