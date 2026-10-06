import { useEngineHost } from "../engine/useEngineHost";
import { useGameVersion } from "../engine/useGameState";
import { blockedReasonKinds, blockedReasonTitle } from "../views/blockedReasonText";

/**
 * The per-reason switches of the grouped "stuck" toasts (spec 024 FR-028): every reason kind can
 * be turned off. The choice is a renderer preference, never part of a save.
 *
 * @returns The switches.
 */
export function ToastSettings() {
  const host = useEngineHost();
  useGameVersion();
  const muted = host.getPrefs().mutedBlockedReasons;
  return (
    <fieldset className="kv-form">
      <legend>Toasts for stuck work, by reason</legend>
      {blockedReasonKinds.map((kind) => (
        <label key={kind} className="kv-choice">
          <input
            type="checkbox"
            checked={!muted.includes(kind)}
            onChange={(event) =>
              host.setPrefs({
                mutedBlockedReasons: event.target.checked
                  ? muted.filter((entry) => entry !== kind)
                  : [...muted, kind],
              })
            }
          />
          {blockedReasonTitle(kind)}
        </label>
      ))}
    </fieldset>
  );
}
