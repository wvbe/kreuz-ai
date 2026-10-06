import { useEffect } from "react";
import type { StateView } from "../../../game/api/Views";
import { speedOptions } from "../engine/gameCommands";
import { useEngineHost } from "../engine/useEngineHost";

/**
 * The keyboard shortcuts of the whole app, shown in Settings and docs/UI.md.
 */
export const keyboardShortcuts: readonly { keys: string; action: string }[] = [
  { keys: "Space", action: "Pause or resume the game" },
  { keys: "1 to 5", action: "Speed 1/4x, 1/2x, 1x, 2x, 4x" },
  { keys: "Q and E", action: "Rotate the map (the map has the focus)" },
  { keys: "Escape", action: "Cancel the tool, clear the selection (the map has the focus)" },
];

function typesText(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    tag === "BUTTON" ||
    tag === "A" ||
    target.isContentEditable
  );
}

/**
 * Registers the global keys: Space pauses or resumes, 1 to 5 choose the speed. They do nothing
 * while a form control or button has the focus (so typing and Space on a button work as usual),
 * without a game, or with a modifier key held. Every key is the same command a time-bar button
 * sends. No focus trap is used anywhere.
 */
export function useGlobalShortcuts(): void {
  const host = useEngineHost();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || typesText(event.target)) {
        return;
      }
      const state = host.store.query("state");
      // The `state` query returns exactly a StateView (see api/Views.ts).
      // eslint-disable-next-line no-restricted-syntax -- JSON to the documented view type of the query name
      const view = state.ok ? (state.data as unknown as StateView) : null;
      if (view === null || !view.hasGame) {
        return;
      }
      if (event.key === " ") {
        event.preventDefault();
        if (view.time.paused) {
          host.commands.resume();
        } else {
          host.commands.pause();
        }
        return;
      }
      const index = Number(event.key) - 1;
      const option = speedOptions[index];
      if (Number.isInteger(index) && option !== undefined) {
        host.commands.setSpeed(option.value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [host]);
}
