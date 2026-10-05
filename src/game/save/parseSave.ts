import { z } from "zod";
import { isJsonObject, jsonValueSchema } from "../ecs/jsonData";
import type { JsonValue } from "../engine/EventBus";
import { InvalidSaveFormatError } from "./InvalidSaveFormatError";
import { initOptionsSchema } from "./initOptions";
import { createDefaultMigrations } from "./migrations/createDefaultMigrations";
import type { JsonObject } from "./migrations/migrationTypes";
import { SaveSectionLocation } from "./SaveSectionRegistry";
import type { SaveSectionRegistry } from "./SaveSectionRegistry";
import { CoreSaveKey, currentSaveVersion } from "./saveTypes";
import type { LoadOptions, ParsedSave } from "./saveTypes";
import { UnsupportedSaveVersionError } from "./UnsupportedSaveVersionError";

/**
 * ISO 8601 UTC with milliseconds, e.g. `2026-10-05T12:00:00.000Z`.
 */
export const isoTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const uint32 = z.number().int().min(0).max(0xffffffff);

const streamStateSchema = z
  .object({ state: z.tuple([uint32, uint32]), inc: z.tuple([uint32, uint32]) })
  .strict();

const coreShape = {
  [CoreSaveKey.Version]: z.literal(currentSaveVersion),
  [CoreSaveKey.Timestamp]: z.string().regex(isoTimestampPattern, "must be ISO 8601 UTC"),
  [CoreSaveKey.Time]: z.record(z.string(), jsonValueSchema),
  [CoreSaveKey.Prng]: z
    .object({ seed: uint32, streams: z.record(z.string(), streamStateSchema) })
    .strict(),
  [CoreSaveKey.EventQueue]: z
    .object({
      queue: z.array(
        z
          .object({
            name: z.string(),
            payload: jsonValueSchema,
            depth: z.number().int().min(0),
          })
          .strict(),
      ),
    })
    .strict(),
  [CoreSaveKey.InitOptions]: initOptionsSchema,
  [CoreSaveKey.Counters]: z.record(z.string(), jsonValueSchema),
  [CoreSaveKey.Systems]: z.record(z.string(), jsonValueSchema),
  [CoreSaveKey.Entities]: z.array(jsonValueSchema),
  [CoreSaveKey.Maps]: z.array(jsonValueSchema),
};

const coreSchema = z.object(coreShape).catchall(jsonValueSchema);

function describeIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.map(String).join(".");
    return `${path === "" ? "(root)" : path}: ${issue.message}`;
  });
}

function toJson(input: string | JsonValue): JsonValue {
  if (typeof input !== "string") {
    const checked = jsonValueSchema.safeParse(input);
    if (!checked.success) {
      throw new InvalidSaveFormatError(
        "save is not plain integer JSON",
        describeIssues(checked.error),
      );
    }
    return checked.data;
  }
  let raw: JsonValue;
  try {
    raw = JSON.parse(input) as JsonValue;
  } catch (error) {
    throw new InvalidSaveFormatError(
      `save is not valid JSON: ${error instanceof Error ? error.message : "parse error"}`,
      [],
      error instanceof Error ? error : undefined,
    );
  }
  const checked = jsonValueSchema.safeParse(raw);
  if (!checked.success) {
    throw new InvalidSaveFormatError(
      "save is not plain integer JSON (fractions are not allowed)",
      describeIssues(checked.error),
    );
  }
  return checked.data;
}

function readVersion(root: JsonObject): number {
  const version = root[CoreSaveKey.Version];
  if (typeof version !== "number" || !Number.isInteger(version) || version < 0) {
    throw new InvalidSaveFormatError("save has no valid integer version", [
      "version: must be a non-negative integer",
    ]);
  }
  return version;
}

/**
 * Turns save text (or an already parsed object) into a validated {@link ParsedSave} without
 * touching any game state: parses JSON, rejects newer versions, migrates older ones forward,
 * then validates the root strictly (unknown or missing root keys, malformed core parts, and
 * every registered section; `initOptions` alone ignores unknown fields). This is the cheap
 * pre-check that makes a corrupt save fail fast (spec 006 SC-004).
 *
 * @param input - Save text or parsed JSON; an object input is not modified.
 * @param options - Sections that may appear in the save, and optionally a migration chain.
 * @returns The validated save.
 */
export function parseSave(
  input: string | JsonValue,
  options: LoadOptions & { sections: SaveSectionRegistry },
): ParsedSave {
  const json = toJson(input);
  if (!isJsonObject(json)) {
    throw new InvalidSaveFormatError("save root must be a JSON object");
  }
  const originalVersion = readVersion(json);
  if (originalVersion > currentSaveVersion) {
    throw new UnsupportedSaveVersionError(originalVersion, currentSaveVersion);
  }
  const migrations = options.migrations ?? createDefaultMigrations();
  const root = migrations.migrate(json, originalVersion, currentSaveVersion);

  const parsed = coreSchema.safeParse(root);
  if (!parsed.success) {
    const found = describeIssues(parsed.error);
    throw new InvalidSaveFormatError(`save failed validation: ${found[0] ?? ""}`, found);
  }
  const data = parsed.data;
  const issues: string[] = [];
  const rootSections: JsonObject = {};
  const systems: JsonObject = { ...data.systems };
  for (const key of Object.keys(data)) {
    if (!(key in coreShape) && !options.sections.get(SaveSectionLocation.Root, key)) {
      issues.push(`${key}: unknown root key`);
    }
  }
  for (const key of Object.keys(systems)) {
    if (!options.sections.get(SaveSectionLocation.Systems, key)) {
      issues.push(`systems.${key}: unknown system section`);
    }
  }
  for (const section of options.sections.list()) {
    const atRoot = section.location === SaveSectionLocation.Root;
    let value: JsonValue | undefined = atRoot ? data[section.key] : systems[section.key];
    if (value === undefined && originalVersion < currentSaveVersion) {
      value = section.defaultForOlderSaves?.();
    }
    const label = atRoot ? section.key : `systems.${section.key}`;
    if (value === undefined) {
      issues.push(`${label}: required section is missing`);
      continue;
    }
    const checked = section.schema.safeParse(value);
    if (!checked.success) {
      issues.push(...describeIssues(checked.error).map((line) => `${label}.${line}`));
    } else if (atRoot) {
      rootSections[section.key] = checked.data;
    } else {
      systems[section.key] = checked.data;
    }
  }
  if (issues.length > 0) {
    throw new InvalidSaveFormatError(`save failed validation: ${issues[0] ?? ""}`, issues);
  }
  return {
    originalVersion,
    timestamp: data.timestamp,
    core: {
      time: data.time,
      prng: data.prng,
      eventQueue: data.eventQueue,
      initOptions: data.initOptions,
      counters: data.counters,
      entities: data.entities,
      maps: data.maps,
    },
    rootSections,
    systems,
  };
}
