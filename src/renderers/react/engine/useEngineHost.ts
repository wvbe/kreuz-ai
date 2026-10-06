import { useContext } from "react";
import { engineContext } from "./engineContext";
import type { EngineHost } from "./EngineHost";

/**
 * The host of the surrounding `EngineProvider`: the way a panel reaches `dispatch`, `commands`,
 * `selection`, `tools`, `navigation` and `toasts`.
 *
 * @returns The host.
 * @throws {Error} When no provider is above the component.
 */
export function useEngineHost(): EngineHost {
  const host = useContext(engineContext);
  if (host === null) {
    throw new Error("useEngineHost needs an EngineProvider above it");
  }
  return host;
}
