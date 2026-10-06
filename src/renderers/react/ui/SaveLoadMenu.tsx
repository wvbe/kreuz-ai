import { useAppServices } from "../AppServices";
import { useEngineHost } from "../engine/useEngineHost";
import { useGameState } from "../engine/useGameState";
import type { StateView } from "../../../game/api/Views";

function selectState(state: StateView): StateView {
  return state;
}

/**
 * Save and load (spec 024 FR-024): download the save as a JSON text file, load one from a file
 * picker, or load the autosave slot. The save format is the engine's (spec 006); the renderer only
 * moves the text.
 *
 * @returns The menu.
 */
export function SaveLoadMenu() {
  const host = useEngineHost();
  const services = useAppServices();
  const state = useGameState(selectState);
  const save = () => {
    const text = host.saveText();
    if (text !== null) {
      services.downloadText(`kreuzvibe-day${state.time.day}-tick${state.time.tick}.json`, text);
    }
  };
  const load = async (file: File | undefined) => {
    if (file !== undefined) {
      host.loadText(await file.text());
    }
  };
  return (
    <div className="kv-saveload">
      <button type="button" disabled={!state.hasGame} onClick={save}>
        Save to file
      </button>
      <label className="kv-file">
        Load from file
        <input
          type="file"
          accept=".json,application/json,text/plain"
          onChange={(event) => {
            void load(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
      <button type="button" disabled={!host.hasAutosave()} onClick={() => host.loadAutosave()}>
        Load autosave
      </button>
    </div>
  );
}
