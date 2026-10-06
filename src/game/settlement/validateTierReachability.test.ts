import { describe, expect, it } from "vitest";
import { ContentFile, SettlementTier } from "../content/contentTypes";
import { bundledContentFiles, loadContent, loadContentPack } from "../content/ContentLoader";
import type { ContentRegistries } from "../content/ContentRegistries";
import type { JsonValue } from "../engine/EventBus";
import { ReachabilityIssueKind, validateTierReachability } from "./validateTierReachability";

type JsonObject = { [key: string]: JsonValue };

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The bundled pack with some records of one file rewritten (a deliberately broken pack).
 */
function patched(
  file: ContentFile,
  targetId: string,
  edit: (record: JsonObject) => JsonObject,
): ContentRegistries {
  const files = { ...bundledContentFiles };
  const records = files[file];
  if (!Array.isArray(records)) {
    throw new Error(`${file} is not a list`);
  }
  files[file] = records.map((record) =>
    isObject(record) && (record["id"] === targetId || record["level"] === targetId)
      ? edit(record)
      : record,
  );
  return loadContentPack(files);
}

function withTrader(record: JsonObject, change: (trader: JsonObject) => JsonObject): JsonObject {
  const components = record["components"];
  const trader = isObject(components) ? components["Trader"] : undefined;
  if (!isObject(components) || !isObject(trader)) {
    throw new Error("no trader");
  }
  return { ...record, components: { ...components, Trader: change(trader) } };
}

describe("validateTierReachability", () => {
  it("passes on the shipped pack: Village is reachable from a Hamlet start", () => {
    expect(validateTierReachability(loadContent())).toEqual([]);
  });

  it("fails when a required zone type unlocks at the tier it should open (FR-010)", () => {
    const content = patched(ContentFile.Zones, "throne_room", (record) => ({
      ...record,
      unlockTier: SettlementTier.Village,
    }));
    const issues = validateTierReachability(content);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      kind: ReachabilityIssueKind.RequirementUnreachable,
      tier: SettlementTier.Village,
      requirement: "active_zone throne_room",
    });
    expect(issues[0]?.message).toContain("zone throne_room unlocks at village");
  });

  it("fails when furniture of a required zone needs a material nobody supplies", () => {
    const content = loadContentPack({
      ...bundledContentFiles,
      [ContentFile.Furniture]: ironTable(),
      [ContentFile.EnginePrototypes]: noRefines(),
    });
    const village = validateTierReachability(content).find(
      (issue) => issue.tier === SettlementTier.Village,
    );
    expect(village?.kind).toBe(ReachabilityIssueKind.RequirementUnreachable);
    expect(village?.missing).toBe("smelt_iron");
    expect(village?.message).toContain("recipe smelt_iron unlocks at village");
  });

  it("accepts iron-dependent furniture through the ore, sale and refined-credit path", () => {
    const content = loadContentPack({
      ...bundledContentFiles,
      [ContentFile.Furniture]: ironTable(),
    });
    expect(validateTierReachability(content)).toEqual([]);
  });

  it("fails when the ore source is locked above Hamlet", () => {
    const content = loadContentPack({
      ...bundledContentFiles,
      [ContentFile.Furniture]: ironTable(),
      [ContentFile.Jobs]: lockedOreJob(),
    });
    const issues = validateTierReachability(content);
    expect(issues.map((issue) => issue.kind)).toContain(ReachabilityIssueKind.RefinedPathBroken);
    expect(issues.some((issue) => issue.tier === SettlementTier.Village)).toBe(true);
  });

  it("fails when the trader does not buy the raw material", () => {
    const content = patched(ContentFile.EnginePrototypes, "trader_caravan", (record) =>
      withTrader(record, (trader) => ({ ...trader, buys: ["limestone", "oak_log", "wheat"] })),
    );
    const issues = validateTierReachability(content);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      kind: ReachabilityIssueKind.RefinedPathBroken,
      missing: "iron_ore",
    });
    expect(issues[0]?.message).toContain("does not buy iron_ore");
  });

  it("fails when Market Town needs dwellings of a level that unlocks too late", () => {
    const late = loadContentPack({
      ...bundledContentFiles,
      [ContentFile.DwellingLevels]: levelsUnlocking("cottage", SettlementTier.MarketTown),
    });
    const issues = validateTierReachability(late);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      tier: SettlementTier.MarketTown,
      requirement: "dwellings_at_level cottage x8",
    });
  });

  it("fails when Chartered Town needs more guilds than the pack has", () => {
    const files = { ...bundledContentFiles };
    const factions = files[ContentFile.Factions];
    if (!Array.isArray(factions)) {
      throw new Error("factions is not a list");
    }
    let kept = 0;
    files[ContentFile.Factions] = factions.map((record) => {
      if (!isObject(record) || record["factionType"] !== "occupational") {
        return record;
      }
      kept += 1;
      return kept <= 2 ? record : { ...record, factionType: "religious" };
    });
    const issues = validateTierReachability(loadContentPack(files));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      tier: SettlementTier.CharteredTown,
      requirement: "founded_guilds 3",
    });
  });

  it("reports a recipe that unlocks before its workstation (FR-011)", () => {
    const content = patched(ContentFile.Furniture, "oven", (record) => ({
      ...record,
      unlockTier: SettlementTier.Village,
    }));
    const issues = validateTierReachability(content).filter(
      (issue) => issue.kind === ReachabilityIssueKind.RecipeBelowWorkstation,
    );
    expect(issues.map((issue) => issue.requirement)).toContain("recipe bake_bread");
  });
});

function listOf(file: ContentFile): JsonValue[] {
  const records = bundledContentFiles[file];
  if (!Array.isArray(records)) {
    throw new Error(`${file} is not a list`);
  }
  return records;
}

/**
 * The furniture list with the table made of iron ingots (a requirement of the Village throne room).
 */
function ironTable(): JsonValue[] {
  return listOf(ContentFile.Furniture).map((record) =>
    isObject(record) && record["id"] === "table"
      ? { ...record, constructionMaterials: [{ materialId: "iron_ingot", quantity: 2 }] }
      : record,
  );
}

function noRefines(): JsonValue[] {
  return listOf(ContentFile.EnginePrototypes).map((record) =>
    isObject(record) && record["id"] === "trader_caravan"
      ? withTrader(record, (trader) => ({ ...trader, refines: [] }))
      : record,
  );
}

function lockedOreJob(): JsonValue[] {
  return listOf(ContentFile.Jobs).map((record) =>
    isObject(record) && record["id"] === "mine.ore"
      ? { ...record, unlockTier: SettlementTier.Village }
      : record,
  );
}

function levelsUnlocking(level: string, tier: SettlementTier): JsonValue[] {
  return listOf(ContentFile.DwellingLevels).map((record) =>
    isObject(record) && record["level"] === level ? { ...record, unlockTier: tier } : record,
  );
}
