import { useState } from "react";
import { useEngineHost } from "../engine/useEngineHost";
import {
  defaultDifficulty,
  difficultyChoices,
  mapSizeChoices,
  parseSeed,
  randomSeed,
  tierChoices,
} from "./newGameOptions";

/**
 * The new-game screen (spec 024 FR-037): difficulty with its one-line description, seed, map size
 * and starting tier. Starting a game sends `new-game` and then pauses the clock so the player can
 * look around before time runs.
 *
 * @returns The form.
 */
export function NewGameScreen() {
  const host = useEngineHost();
  const [seedText, setSeedText] = useState("42");
  const [difficulty, setDifficulty] = useState(defaultDifficulty);
  const [mapSize, setMapSize] = useState("0");
  const [tier, setTier] = useState("hamlet");
  const seed = parseSeed(seedText);
  const start = () => {
    if (seed === null) {
      return;
    }
    const result = host.newGame({
      seed,
      difficulty,
      mapSize: Number(mapSize),
      startingTier: tier,
    });
    if (result.ok) {
      host.commands.pause();
    }
  };
  return (
    <section className="kv-screen">
      <h2>New game</h2>
      <form
        className="kv-form"
        onSubmit={(event) => {
          event.preventDefault();
          start();
        }}
      >
        <fieldset>
          <legend>Difficulty</legend>
          {difficultyChoices.map((choice) => (
            <label key={choice.value} className="kv-choice">
              <input
                type="radio"
                name="difficulty"
                value={choice.value}
                checked={difficulty === choice.value}
                onChange={() => setDifficulty(choice.value)}
              />
              <strong>{choice.label}</strong>
              <span>{choice.description}</span>
            </label>
          ))}
        </fieldset>
        <label>
          Seed
          <input
            type="text"
            inputMode="numeric"
            value={seedText}
            aria-invalid={seed === null}
            onChange={(event) => setSeedText(event.target.value)}
          />
        </label>
        <button type="button" onClick={() => setSeedText(String(randomSeed(Math.random)))}>
          Random seed
        </button>
        {seed === null ? (
          <p role="alert">The seed is a whole number from 0 to 4294967295.</p>
        ) : null}
        <label>
          Map size
          <select value={mapSize} onChange={(event) => setMapSize(event.target.value)}>
            {mapSizeChoices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label} ({choice.description})
              </option>
            ))}
          </select>
        </label>
        <label>
          Starting tier
          <select value={tier} onChange={(event) => setTier(event.target.value)}>
            {tierChoices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={seed === null}>
          Start game
        </button>
      </form>
    </section>
  );
}
