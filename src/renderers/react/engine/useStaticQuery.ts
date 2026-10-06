import { useMemo } from "react";
import type { JsonValue } from "../../../game/engine/EventBus";
import type { QueryState } from "./useGameState";
import { useEngineHost } from "./useEngineHost";

/**
 * Runs a query whose answer only changes with a new or loaded game (map geometry): it is
 * computed once per game epoch, not once per tick.
 *
 * @param name - The query name.
 * @param args - Query arguments as JSON.
 * @returns The view or the failure.
 */
export function useStaticQuery<View>(name: string, args: JsonValue = {}): QueryState<View> {
  const host = useEngineHost();
  const epoch = host.store.epoch();
  const key = JSON.stringify(args);
  return useMemo(() => {
    const result = host.session.query.run(name, args);
    // The caller states the view type of the query name.
    // eslint-disable-next-line no-restricted-syntax -- JSON to the documented view type of the query name
    return result as unknown as QueryState<View>;
  }, [host, epoch, name, key]);
}
