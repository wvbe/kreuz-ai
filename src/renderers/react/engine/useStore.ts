import { useSyncExternalStore } from "react";
import type { ExternalStore } from "./StoreBase";

/**
 * Subscribes a component to one of the renderer stores (selection, tools, toasts, navigation).
 *
 * @param store - The store.
 * @returns Its current state; the component re-renders when it changes.
 */
export function useStore<State>(store: ExternalStore<State>): State {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
