/**
 * What `useSyncExternalStore` needs from a store; every renderer store has this shape.
 */
export type ExternalStore<State> = {
  /**
   * Registers a listener called after every change; returns the function that removes it.
   */
  subscribe: (listener: () => void) => () => void;
  /**
   * The current state. The same object is returned until the next change, so React can compare
   * snapshots by identity.
   */
  getSnapshot: () => State;
};

/**
 * Base of the small external stores of the renderer (selection, tools, toasts, navigation, the
 * game version): an immutable state object that is replaced on every change.
 */
export class StoreBase<State> implements ExternalStore<State> {
  private readonly listeners = new Set<() => void>();

  /**
   * Creates the store.
   *
   * @param state - The initial state.
   */
  constructor(private state: State) {}

  /**
   * Registers a listener (stable property, safe to hand to React).
   *
   * @param listener - Called after every change.
   * @returns A function that unregisters the listener.
   */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * The current immutable state (stable property, safe to hand to React).
   *
   * @returns The state.
   */
  readonly getSnapshot = (): State => this.state;

  /**
   * Replaces the state and tells the listeners.
   *
   * @param next - The new state object.
   */
  protected replace(next: State): void {
    this.state = next;
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}
