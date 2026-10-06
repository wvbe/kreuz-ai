import { useEngineHost } from "./engine/useEngineHost";
import { useGameState } from "./engine/useGameState";
import { useStore } from "./engine/useStore";
import { Screen } from "./navigation/Screen";
import { screenRegistry } from "./screens/screenRegistry";
import { TimeControls } from "./ui/TimeControls";
import { ToastHost } from "./ui/ToastHost";
import type { StateView } from "../../game/api/Views";

function hasGame(state: StateView): boolean {
  return state.hasGame;
}

/**
 * The frame of the app: the menu of screens, the time bar, the active screen and the toasts. A
 * screen is routed by the navigation store (no reload, spec 024 FR-022); without a game the shell
 * shows the new-game screen.
 *
 * @returns The shell.
 */
export function AppShell() {
  const host = useEngineHost();
  const navigation = useStore(host.navigation);
  const gameExists = useGameState(hasGame);
  const wanted =
    gameExists || navigation.screen === Screen.Settings ? navigation.screen : Screen.NewGame;
  const definition = screenRegistry.find((entry) => entry.screen === wanted) ?? screenRegistry[0];
  return (
    <div className="kv-shell">
      <header className="kv-header">
        <h1>Kreuzvibe</h1>
        <nav aria-label="Screens">
          {screenRegistry.map((entry) => (
            <button
              key={entry.screen}
              type="button"
              aria-current={entry.screen === wanted ? "page" : undefined}
              disabled={
                !gameExists && entry.screen !== Screen.NewGame && entry.screen !== Screen.Settings
              }
              onClick={() => host.navigation.navigate(entry.screen)}
            >
              {entry.label}
            </button>
          ))}
        </nav>
        <TimeControls />
      </header>
      <main className="kv-main">{definition?.render()}</main>
      <ToastHost />
    </div>
  );
}
