import type { ComponentDefinition } from "../ecs/ComponentRegistry";
import type { Entity } from "../ecs/Entity";
import type { InitOptionsData } from "../save/initOptions";
import type { SaveSection } from "../save/SaveSectionRegistry";
import type { SpeedSetting } from "../time/GameTime";
import type { JsonValue } from "./EventBus";
import type { GameEngine } from "./GameEngine";
import type { TickContext, TickSlot } from "./TickPipeline";

/**
 * Why init hooks run: after a fresh `newGame` or after a successful `loadGame`.
 */
export enum InitMode {
  NewGame = "new-game",
  LoadGame = "load-game",
}

/**
 * What an init hook receives (spec 007 FR-015).
 */
export type SystemInitContext = {
  /**
   * The engine that is being initialised. Hooks may read and change its state.
   */
  engine: GameEngine;
  /**
   * `NewGame`: the world is empty except for the government faction entity; generators belong
   * here. `LoadGame`: all saved state is already restored; rebuild derived indexes here.
   */
  mode: InitMode;
  /**
   * The validated options of this game (restored from the save on load).
   */
  options: InitOptionsData;
};

/**
 * A command handler (provisional shape; task 1.9 builds the dispatcher). The payload is the
 * command's JSON; the return value becomes `CommandResult.data`.
 */
export type CommandHandler = (payload: JsonValue, engine: GameEngine) => JsonValue;

/**
 * Everything a later task needs to add a system, in one object for
 * `GameEngine.registerSystem` (see `src/game/engine/README.md`).
 */
export type EngineSystemDefinition = {
  /**
   * Unique id of the system, dotted lowercase segments (`needs.decay`). Doubles as the pipeline
   * id and as the dependency name other systems use.
   */
  id: string;
  /**
   * Pipeline slot (DECISIONS section 2) the `run` function belongs to. Required with `run`.
   */
  slot?: TickSlot;
  /**
   * Order inside the slot, ascending; default 0. Equal orders keep registration order.
   */
  order?: number;
  /**
   * Called once per tick at `slot`.
   */
  run?: (context: TickContext) => void;
  /**
   * Ids of systems that must be initialised before this one.
   */
  dependencies?: readonly string[];
  /**
   * Synchronous hook for `newGame` and `loadGame`, in dependency order.
   */
  init?: (context: SystemInitContext) => void;
  /**
   * Save section for the system's own state (root key or `systems.<key>`).
   */
  saveSection?: SaveSection;
  /**
   * Component definitions this system owns; registered with the engine's component registry.
   */
  components?: readonly ComponentDefinition[];
  /**
   * Command handlers by command kind (provisional, see {@link CommandHandler}).
   */
  commandHandlers?: { [commandKind: string]: CommandHandler };
};

/**
 * Read-only view of the clock returned by `GameEngine.getTime`.
 */
export type GameTimeView = {
  tick: number;
  paused: boolean;
  speed: SpeedSetting;
  tickIntervalMs: number;
  day: number;
  tickOfDay: number;
  hourOfDay: number;
};

/**
 * Read-only summary returned by `GameEngine.getState` (a snapshot, never live state).
 */
export type GameStateView = {
  hasGame: boolean;
  time: GameTimeView;
  initOptions: InitOptionsData;
  entityCount: number;
  mapCount: number;
};

/**
 * Entity snapshot returned by the query facade: a deep copy that does not write through.
 */
export type EntityView = Entity;
