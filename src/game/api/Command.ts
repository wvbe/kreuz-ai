import { z } from "zod";
import { jsonValueSchema } from "../ecs/jsonData";
import { maxTickIntervalMs, SpeedSetting } from "../time/GameTime";

/**
 * Kinds of the kernel commands (DECISIONS section 3.1). Later phases register their own kinds
 * through `registerSystem({ commandHandlers })`; those are plain strings and need no entry here.
 * Values are kebab-case and are what travels in the JSON `kind` field.
 */
export enum CommandKind {
  NewGame = "new-game",
  LoadGame = "load-game",
  SaveGame = "save-game",
  Pause = "pause",
  Resume = "resume",
  SetSpeed = "set-speed",
  SetTickInterval = "set-tick-interval",
  Step = "step",
}

/**
 * Upper bound of one Step command (and of `runUntil`'s `maxTicks`); keeps a single call bounded.
 */
export const maxStepTicks = 1_000_000;

/**
 * Payload of NewGame: the options of `GameEngine.newGame`; the engine validates them and reports
 * every problem with its exact messages (spec 007 US4).
 */
export const newGamePayloadSchema = z
  .object({ options: z.record(z.string(), jsonValueSchema).optional() })
  .strict();

/**
 * Payload of LoadGame: the save text (spec 006).
 */
export const loadGamePayloadSchema = z.object({ save: z.string().min(1) }).strict();

/**
 * Payload of SaveGame: an optional ISO timestamp injected by the host.
 */
export const saveGamePayloadSchema = z.object({ timestamp: z.string().min(1).optional() }).strict();

/**
 * Payload of Pause and Resume.
 */
export const emptyPayloadSchema = z.object({}).strict();

/**
 * Payload of SetSpeed.
 */
export const setSpeedPayloadSchema = z.object({ speed: z.enum(SpeedSetting) }).strict();

/**
 * Payload of SetTickInterval.
 */
export const setTickIntervalPayloadSchema = z
  .object({ tickIntervalMs: z.number().int().min(1).max(maxTickIntervalMs) })
  .strict();

/**
 * Payload of Step: how many ticks to run (1..{@link maxStepTicks}).
 */
export const stepPayloadSchema = z
  .object({ ticks: z.number().int().min(1).max(maxStepTicks) })
  .strict();

/**
 * Starts a new game.
 */
export type NewGameCommand = { kind: CommandKind.NewGame } & z.infer<typeof newGamePayloadSchema>;

/**
 * Loads a save text.
 */
export type LoadGameCommand = { kind: CommandKind.LoadGame } & z.infer<
  typeof loadGamePayloadSchema
>;

/**
 * Serializes the game; the result's `data` is the save text.
 */
export type SaveGameCommand = { kind: CommandKind.SaveGame } & z.infer<
  typeof saveGamePayloadSchema
>;

/**
 * Pauses the clock.
 */
export type PauseCommand = { kind: CommandKind.Pause };

/**
 * Resumes the clock.
 */
export type ResumeCommand = { kind: CommandKind.Resume };

/**
 * Sets the speed setting.
 */
export type SetSpeedCommand = { kind: CommandKind.SetSpeed } & z.infer<
  typeof setSpeedPayloadSchema
>;

/**
 * Sets the real-time length of one tick (used by the host's auto runner).
 */
export type SetTickIntervalCommand = { kind: CommandKind.SetTickInterval } & z.infer<
  typeof setTickIntervalPayloadSchema
>;

/**
 * Runs a number of ticks.
 */
export type StepCommand = { kind: CommandKind.Step } & z.infer<typeof stepPayloadSchema>;

/**
 * The typed kernel commands, a JSON discriminated union on `kind`. Commands of later phases are
 * registered by kind string and dispatched as `{ kind: string, ...payload }` JSON.
 */
export type Command =
  | NewGameCommand
  | LoadGameCommand
  | SaveGameCommand
  | PauseCommand
  | ResumeCommand
  | SetSpeedCommand
  | SetTickIntervalCommand
  | StepCommand;
