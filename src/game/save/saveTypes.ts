import type { EntityStore } from "../ecs/EntityStore";
import type { EventBus, EventBusState, JsonValue } from "../engine/EventBus";
import type { IdCounters } from "../engine/IdCounters";
import type { Prng, PrngState } from "../engine/Prng";
import type { MapRegistry } from "../map/MapRegistry";
import type { TaskSystem } from "../task/TaskSystem";
import type { GameTime } from "../time/GameTime";
import type { InitOptionsData } from "./initOptions";
import type { SaveSectionRegistry } from "./SaveSectionRegistry";
import type { JsonObject } from "./migrations/migrationTypes";
import type { MigrationRegistry } from "./migrations/MigrationRegistry";

/**
 * The save format version this build writes (DECISIONS D-05). Raise it together with a new
 * migration step in `migrations/createDefaultMigrations.ts`.
 */
export const currentSaveVersion = 1;

/**
 * `timestamp` written when the host supplies none. It is metadata only and excluded from every
 * equality and hash (spec 006 FR-006a), so it must not depend on a clock inside `src/game`.
 */
export const defaultSaveTimestamp = "1970-01-01T00:00:00.000Z";

/**
 * Root keys owned by the save module. Further root keys (`statuses`, `productionLedger`,
 * `stewardship`) come from registered sections.
 */
export enum CoreSaveKey {
  Version = "version",
  Timestamp = "timestamp",
  Time = "time",
  Prng = "prng",
  EventQueue = "eventQueue",
  InitOptions = "initOptions",
  Counters = "counters",
  Systems = "systems",
  Entities = "entities",
  Maps = "maps",
}

/**
 * Holder for the generator, because loading replaces the whole `Prng` object (its streams are
 * rebuilt from the saved state). Systems read `holder.prng` at use time.
 */
export type PrngHolder = { prng: Prng };

/**
 * Holder for the options the game was created with.
 */
export type InitOptionsHolder = { options: InitOptionsData };

/**
 * The live objects of one game that a save reads and a load overwrites. The engine (task 1.8)
 * builds this once per game; tests assemble it from the individual modules.
 */
export type GameSnapshotParts = {
  time: GameTime;
  prng: PrngHolder;
  bus: EventBus;
  counters: IdCounters;
  store: EntityStore;
  maps: MapRegistry;
  /**
   * Task state lives in entity components; the system only rebuilds its wait index.
   */
  tasks: Pick<TaskSystem, "rebuildWaitIndex">;
  initOptions: InitOptionsHolder;
  sections: SaveSectionRegistry;
};

/**
 * Options of `saveGame` and `serializeGame`.
 */
export type SaveOptions = {
  /**
   * ISO 8601 UTC text injected by the host; defaults to {@link defaultSaveTimestamp}.
   */
  timestamp?: string;
};

/**
 * Options of `parseSave` and `loadGame`.
 */
export type LoadOptions = {
  /**
   * Migration chain to use; defaults to the built-in one.
   */
  migrations?: MigrationRegistry;
};

/**
 * The validated core of a save, ready to be applied.
 */
export type CoreSaveData = {
  time: JsonObject;
  prng: PrngState;
  eventQueue: EventBusState;
  initOptions: InitOptionsData;
  counters: JsonObject;
  entities: JsonValue[];
  maps: JsonValue[];
};

/**
 * A save that passed parsing, migration and validation. Nothing has been applied yet.
 */
export type ParsedSave = {
  /**
   * Version found in the input, before migration.
   */
  originalVersion: number;
  timestamp: string;
  core: CoreSaveData;
  /**
   * Validated JSON of registered root sections by root key.
   */
  rootSections: JsonObject;
  /**
   * Validated JSON of registered `systems` sections by key.
   */
  systems: JsonObject;
};
