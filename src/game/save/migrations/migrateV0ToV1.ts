import { isJsonObject } from "../../ecs/jsonData";
import type { JsonValue } from "../../engine/EventBus";
import { CounterName, firstId } from "../../engine/IdCounters";
import type { JsonObject } from "./migrationTypes";

const renamedDifficulties: { [oldName: string]: string } = { normal: "steady", hard: "harsh" };

function highestId(records: JsonValue | undefined): number {
  let highest = 0;
  if (Array.isArray(records)) {
    for (const record of records) {
      if (isJsonObject(record) && typeof record["id"] === "number") {
        highest = Math.max(highest, record["id"]);
      }
    }
  }
  return highest;
}

function highestTaskId(entities: JsonValue | undefined): number {
  let highest = 0;
  if (!Array.isArray(entities)) {
    return highest;
  }
  for (const entity of entities) {
    const components = isJsonObject(entity) ? entity["components"] : undefined;
    const queue = isJsonObject(components) ? components["TaskQueue"] : undefined;
    if (isJsonObject(queue)) {
      highest = Math.max(highest, highestId(queue["tasks"]), highestId(queue["history"]));
    }
  }
  return highest;
}

/**
 * Migration 0 -> 1 (DECISIONS D-05, spec 006 FR-016): renames `initOptions.difficulty` `normal`
 * and `hard` to `steady` and `harsh`; adds the `counters` key (v0 saves had none) derived from the
 * highest entity, map and task ids so no id is ever reused; adds an empty `systems` object.
 *
 * @param root - A version 0 save root (a private copy).
 * @returns The same root in the version 1 layout.
 */
export function migrateV0ToV1(root: JsonObject): JsonObject {
  const migrated: JsonObject = { ...root };
  const options = migrated["initOptions"];
  if (isJsonObject(options)) {
    const difficulty = options["difficulty"];
    if (typeof difficulty === "string" && difficulty in renamedDifficulties) {
      migrated["initOptions"] = { ...options, difficulty: renamedDifficulties[difficulty] ?? "" };
    }
  }
  if (migrated["counters"] === undefined) {
    const counters: { [name: string]: number } = {};
    for (const name of Object.values(CounterName)) {
      counters[name] = firstId;
    }
    counters[CounterName.EntityId] = highestId(migrated["entities"]) + 1;
    counters[CounterName.MapId] = highestId(migrated["maps"]) + 1;
    counters[CounterName.TaskId] = highestTaskId(migrated["entities"]) + 1;
    migrated["counters"] = counters;
  }
  if (migrated["systems"] === undefined) {
    migrated["systems"] = {};
  }
  return migrated;
}
