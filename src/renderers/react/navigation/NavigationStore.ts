import { StoreBase } from "../engine/StoreBase";
import { Screen } from "./Screen";

/**
 * Which screen is shown.
 */
export type NavigationState = {
  screen: Screen;
  /**
   * The screen shown before, for a back button; null at the start.
   */
  previous: Screen | null;
};

/**
 * Parses a URL hash such as `#flow` into a screen.
 *
 * @param hash - The hash including `#` (or empty).
 * @returns The screen, or null when the hash names none.
 */
export function screenFromHash(hash: string): Screen | null {
  const name = hash.replace(/^#\/?/, "");
  return Object.values(Screen).find((screen) => screen === name) ?? null;
}

/**
 * The navigation store. Any panel can call `navigate` through the host
 * (`host.navigation.navigate(Screen.Flow)`); the shell renders the matching screen.
 */
export class NavigationStore extends StoreBase<NavigationState> {
  /**
   * Creates the store.
   *
   * @param start - The first screen; the map unless a game is missing.
   */
  constructor(start: Screen = Screen.Map) {
    super({ screen: start, previous: null });
  }

  /**
   * Shows a screen.
   *
   * @param screen - The target.
   */
  navigate(screen: Screen): void {
    const current = this.getSnapshot();
    if (current.screen !== screen) {
      this.replace({ screen, previous: current.screen });
    }
  }

  /**
   * Returns to the previous screen, or the map when there is none.
   */
  back(): void {
    this.navigate(this.getSnapshot().previous ?? Screen.Map);
  }
}
