import { speedOptions } from "../engine/gameCommands";
import { useEngineHost } from "../engine/useEngineHost";
import { useGameState } from "../engine/useGameState";
import type { StateView } from "../../../game/api/Views";

function selectState(state: StateView): StateView {
  return state;
}

/**
 * The time bar (spec 024, plan 6.1): day and hour, pause or resume, the five speeds and a
 * single-step button while paused. Every button is a command (`pause`, `resume`, `set-speed`,
 * `step`); the clock itself is the host's.
 *
 * @returns The bar.
 */
export function TimeControls() {
  const host = useEngineHost();
  const state = useGameState(selectState);
  if (!state.hasGame) {
    return <div className="kv-time">No game running</div>;
  }
  const { time } = state;
  const hour = String(time.hourOfDay).padStart(2, "0");
  return (
    <div className="kv-time" role="group" aria-label="Time controls">
      <span className="kv-time-clock">
        Day {time.day}, {hour}:00 <small>tick {time.tick}</small>
      </span>
      <button
        type="button"
        onClick={() => (time.paused ? host.commands.resume() : host.commands.pause())}
        aria-pressed={time.paused}
      >
        {time.paused ? "Resume" : "Pause"}
      </button>
      {time.paused ? (
        <button type="button" onClick={() => host.commands.step(1)}>
          Step
        </button>
      ) : null}
      {speedOptions.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={time.speed === option.value}
          onClick={() => host.commands.setSpeed(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
