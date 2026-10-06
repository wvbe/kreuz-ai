import type { CommandResult } from "../../../game/api/CommandResult";
import type { JsonValue } from "../../../game/engine/EventBus";

/**
 * Any command as JSON: `{ kind, ...payload }`. The session validates it against the schema the
 * system registered, so a typo is an error result, never a crash.
 */
export type GameCommand = { kind: string } & { [field: string]: JsonValue };

/**
 * What the typed wrappers need from the host: send a command, run ticks.
 */
export type CommandSink = {
  /**
   * Sends one command through the session and refreshes the views.
   */
  dispatch: (command: GameCommand) => CommandResult;
  /**
   * Runs ticks through the session (the `step` command) and refreshes the views.
   */
  step: (ticks: number) => CommandResult;
};

/**
 * The speed settings of the clock (the `set-speed` command takes the permille value).
 */
export const speedOptions: readonly { label: string; value: number }[] = [
  { label: "1/4x", value: 250 },
  { label: "1/2x", value: 500 },
  { label: "1x", value: 1000 },
  { label: "2x", value: 2000 },
  { label: "4x", value: 4000 },
];

/**
 * New-game options of the shell: what the new-game screen collects.
 */
export type NewGameOptions = {
  seed: number;
  difficulty: string;
  /**
   * 0 Small, 1 Medium, 2 Large.
   */
  mapSize: number;
  startingTier: string;
};

/**
 * The typed command surface of the renderer (spec 024 FR-010): every panel sends its commands
 * through these functions, and every function ends in `session.dispatch`, the same path the CLI
 * uses. Tasks 6.3 to 6.5 add their wrappers here or call `send` with the command kind of the
 * catalogue in docs/CLI.md and docs/PLAYING.md.
 */
export type GameCommands = {
  /**
   * Sends any command.
   */
  send: (command: GameCommand) => CommandResult;
  pause: () => CommandResult;
  resume: () => CommandResult;
  /**
   * Sets the clock speed (one of {@link speedOptions}).
   */
  setSpeed: (speed: number) => CommandResult;
  /**
   * Runs ticks (also while paused: only queued commands are applied then).
   */
  step: (ticks: number) => CommandResult;
  /**
   * Places a build definition: `PlaceWall` for walls, `PlaceDoor` for doors, `PlaceFurniture`
   * for anything else (the same mapping as the CLI `build` verb).
   */
  placeBuild: (prototypeId: string, mapId: number, cells: readonly number[]) => CommandResult;
  /**
   * Starts a game.
   */
  newGame: (options: NewGameOptions) => CommandResult;
};

/**
 * Builds the typed command surface over a sink.
 *
 * @param sink - The host's dispatch and step.
 * @returns The command functions.
 */
export function createGameCommands(sink: CommandSink): GameCommands {
  return {
    send: (command) => sink.dispatch(command),
    pause: () => sink.dispatch({ kind: "pause" }),
    resume: () => sink.dispatch({ kind: "resume" }),
    setSpeed: (speed) => sink.dispatch({ kind: "set-speed", speed }),
    step: (ticks) => sink.step(ticks),
    placeBuild: (prototypeId, mapId, cells) => {
      const first = cells[0] ?? 0;
      if (prototypeId === "wall") {
        return sink.dispatch({ kind: "PlaceWall", mapId, cells: [...cells] });
      }
      if (prototypeId === "door") {
        return sink.dispatch({ kind: "PlaceDoor", mapId, cell: first });
      }
      return sink.dispatch({
        kind: "PlaceFurniture",
        furnitureId: prototypeId,
        mapId,
        cell: first,
      });
    },
    newGame: (options) =>
      sink.dispatch({
        kind: "new-game",
        options: {
          seed: options.seed,
          difficulty: options.difficulty,
          mapSize: options.mapSize,
          startingTier: options.startingTier,
        },
      }),
  };
}
