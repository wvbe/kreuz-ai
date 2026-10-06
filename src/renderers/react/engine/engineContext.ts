import { createContext } from "react";
import type { EngineHost } from "./EngineHost";

/**
 * The React context that carries the `EngineHost` to every component; use `EngineProvider` to
 * set it and `useEngineHost` to read it.
 */
export const engineContext = createContext<EngineHost | null>(null);
