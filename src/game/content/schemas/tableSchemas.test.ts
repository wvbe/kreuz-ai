import { describe, expect, it } from "vitest";
import { bundledContentFiles } from "../ContentLoader";
import { ContentFile } from "../contentTypes";
import {
  contentConstantsSchema,
  difficultyModeSchema,
  dwellingLevelSchema,
  momentTemplateSchema,
  nameFormatsSchema,
  settlementTierSchema,
} from "./tableSchemas";

describe("contentConstantsSchema", () => {
  const constants = bundledContentFiles[ContentFile.ContentConstants];

  // @covers 022:FR-023 022:FR-016 026:FR-027
  it("converts ratios and percentages and rejects out-of-range values", () => {
    const parsed = contentConstantsSchema.parse(constants);
    expect(parsed.bynameChance).toBe(850);
    expect(parsed.defaultRestockFraction).toBe(750);
    expect(
      contentConstantsSchema.safeParse({ ...(constants as object), upgradeGraceDays: 0 }).success,
    ).toBe(false);
    expect(
      contentConstantsSchema.safeParse({ ...(constants as object), bynameChance: 1.5 }).success,
    ).toBe(false);
    expect(contentConstantsSchema.safeParse({ ...(constants as object), extra: 1 }).success).toBe(
      false,
    );
  });
});

describe("settlementTierSchema", () => {
  it("parses each requirement kind", () => {
    const tier = settlementTierSchema.parse({
      tier: "village",
      settlementNoun: "village",
      requirements: [
        { kind: "population", min: 8 },
        { kind: "dwellings_at_level", level: "hovel", min: 4 },
        { kind: "active_zone", zoneTypeIds: ["throne_room"], min: 1 },
        { kind: "founded_guilds", min: 1 },
        { kind: "milestone_reached", milestone: "first-market" },
      ],
    });
    expect(tier.requirements).toHaveLength(5);
    expect(settlementTierSchema.safeParse({ tier: "city", settlementNoun: "city" }).success).toBe(
      false,
    );
  });
});

describe("difficultyModeSchema", () => {
  it("converts multipliers to permille", () => {
    expect(
      difficultyModeSchema.parse({
        difficulty: "peaceful",
        decayMultiplier: 0.5,
        needDecayMultiplier: 0.7,
        factionHostilityMultiplier: 0.25,
      }),
    ).toMatchObject({
      decayMultiplier: 500,
      needDecayMultiplier: 700,
      factionHostilityMultiplier: 250,
    });
  });
});

describe("dwellingLevelSchema", () => {
  it("converts supplied goods rates to milli", () => {
    const level = dwellingLevelSchema.parse({
      level: "cottage",
      capacity: 3,
      rentPerDay: 1,
      minTiles: 6,
      foodVariety: 2,
      suppliedGoods: [{ materialIds: ["bread"], perResidentPerDay: 0.25 }],
    });
    expect(level.suppliedGoods[0]?.perResidentPerDay).toBe(250);
    expect(dwellingLevelSchema.safeParse({ level: "palace" }).success).toBe(false);
  });
});

describe("momentTemplateSchema and nameFormatsSchema", () => {
  it("require non-empty text", () => {
    expect(momentTemplateSchema.safeParse({ kind: "died", template: "{name} died." }).success).toBe(
      true,
    );
    expect(momentTemplateSchema.safeParse({ kind: "unknown", template: "x" }).success).toBe(false);
    expect(nameFormatsSchema.safeParse(bundledContentFiles[ContentFile.NameFormats]).success).toBe(
      true,
    );
    expect(nameFormatsSchema.safeParse({ plain: "{given}" }).success).toBe(false);
  });
});
