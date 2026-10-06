import type { ReactNode } from "react";
import { engineContext } from "./engineContext";
import type { EngineHost } from "./EngineHost";

/**
 * Provides the host to the tree below.
 *
 * @param props - The host and the children.
 * @returns The provider element.
 */
export function EngineProvider(props: { host: EngineHost; children: ReactNode }) {
  return <engineContext.Provider value={props.host}>{props.children}</engineContext.Provider>;
}
