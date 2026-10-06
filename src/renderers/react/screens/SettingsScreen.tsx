import { useEngineHost } from "../engine/useEngineHost";
import { useGameVersion } from "../engine/useGameState";
import { ToastSettings } from "../notifications/ToastSettings";
import { SaveLoadMenu } from "../ui/SaveLoadMenu";
import { keyboardShortcuts } from "../ui/useGlobalShortcuts";

/**
 * Settings: the renderer preferences (never saved with the game) and save or load.
 *
 * @returns The screen.
 */
export function SettingsScreen() {
  const host = useEngineHost();
  useGameVersion();
  const prefs = host.getPrefs();
  return (
    <section className="kv-screen">
      <h2>Settings</h2>
      <div className="kv-form">
        <label>
          Autosave every N ticks (0 = off; 288 ticks are one day)
          <input
            type="number"
            min={0}
            value={prefs.autosaveEveryTicks}
            onChange={(event) =>
              host.setPrefs({
                autosaveEveryTicks: Math.max(0, Math.floor(Number(event.target.value))),
              })
            }
          />
        </label>
        <label>
          Toasts per game hour before they fold
          <input
            type="number"
            min={0}
            value={prefs.toastBurstLimit}
            onChange={(event) =>
              host.setPrefs({
                toastBurstLimit: Math.max(0, Math.floor(Number(event.target.value))),
              })
            }
          />
        </label>
        <label className="kv-choice">
          <input
            type="checkbox"
            checked={prefs.showBadges}
            onChange={(event) => host.setPrefs({ showBadges: event.target.checked })}
          />
          Show idle and blocked badges
        </label>
        <label className="kv-choice">
          <input
            type="checkbox"
            checked={prefs.showZones}
            onChange={(event) => host.setPrefs({ showZones: event.target.checked })}
          />
          Show zones
        </label>
      </div>
      <ToastSettings />
      <h3>Keyboard shortcuts</h3>
      <dl className="kv-shortcuts">
        {keyboardShortcuts.map((shortcut) => (
          <div key={shortcut.keys}>
            <dt>{shortcut.keys}</dt>
            <dd>{shortcut.action}</dd>
          </div>
        ))}
      </dl>
      <h3>Save and load</h3>
      <SaveLoadMenu />
    </section>
  );
}
