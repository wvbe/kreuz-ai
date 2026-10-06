import { useMemo, useSyncExternalStore } from "react";
import type { ApiErrorData, EventRecord } from "../../../game/api/CommandResult";
import type { StateView, Views } from "../../../game/api/Views";
import type { JsonValue } from "../../../game/engine/EventBus";
import { matchEventPattern } from "./matchEventPattern";
import { useEngineHost } from "./useEngineHost";

/**
 * The result of a typed query: the view, or the structured failure.
 */
export type QueryState<View> = { ok: true; data: View } | { ok: false; error: ApiErrorData };

/**
 * The version of the game as the store counts it: it grows after every tick, command, new or
 * loaded game. Read it to re-render on any change; most components want `useGameState` or
 * `useQuery` instead.
 *
 * @returns The version number.
 */
export function useGameVersion(): number {
  const host = useEngineHost();
  return useSyncExternalStore(host.store.subscribe, host.store.getSnapshot);
}

/**
 * Reads a slice of the `state` view (clock, seed, difficulty, counts), re-evaluated after every
 * change of the game (spec 024 FR-009).
 *
 * @param selector - Picks what the component needs; keep it cheap and pure.
 * @returns The selected value.
 */
export function useGameState<Selected>(selector: (state: StateView) => Selected): Selected {
  const host = useEngineHost();
  const version = useGameVersion();
  return useMemo(() => {
    const result = host.store.query("state");
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    // The `state` query returns exactly a StateView (see api/Views.ts).
    // eslint-disable-next-line no-restricted-syntax -- JSON to the documented view type of the query name
    return selector(result.data as unknown as StateView);
  }, [host, version, selector]);
}

/**
 * Runs a kernel query by name; the result is computed once per game version and shared between
 * components.
 *
 * @param name - A key of `Views`, for example `map` or `entity`.
 * @param args - Query arguments as JSON.
 * @returns The typed view or the failure.
 */
export function useQuery<Name extends keyof Views>(
  name: Name,
  args?: JsonValue,
): QueryState<Views[Name]>;
/**
 * Runs any registered query by name; the caller states the view type it expects (the types of
 * later phases live in their own folders and are imported type-only).
 *
 * @param name - The query name, for example `idle-blocked`.
 * @param args - Query arguments as JSON.
 * @returns The view or the failure.
 */
export function useQuery<View>(name: string, args?: JsonValue): QueryState<View>;
/**
 * Implementation of the overloads.
 *
 * @param name - The query name.
 * @param args - Query arguments as JSON.
 * @returns The view or the failure.
 */
export function useQuery(name: string, args: JsonValue = {}): QueryState<JsonValue> {
  const host = useEngineHost();
  const version = useGameVersion();
  const key = JSON.stringify(args);
  return useMemo(
    () => host.store.query(name, args),
    // `key` stands for the identity of `args`: a new object with the same JSON keeps the memo.
    [host, version, name, key],
  );
}

/**
 * The recent events whose name matches a topic pattern (`command.*`, `housing.**`), newest last.
 *
 * @param pattern - Topic pattern as the event bus reads it.
 * @param limit - At most this many (default 50, the newest).
 * @returns The matching events; changes when the game version grows.
 */
export function useEvents(pattern: string, limit = 50): readonly EventRecord[] {
  const host = useEngineHost();
  const version = useGameVersion();
  return useMemo(
    () =>
      host.store
        .recentEvents()
        .filter((record) => matchEventPattern(pattern, record.name))
        .slice(-limit),
    [host, version, pattern, limit],
  );
}
