import { describe, expect, it } from "vitest";
import {
  animalPrototypeSchema,
  factionSchema,
  humanoidPrototypeSchema,
  nameListSchema,
  needSchema,
  skillSchema,
  traitSchema,
} from "./characterSchemas";

describe("needSchema", () => {
  it("converts percent points to milli-percent", () => {
    const need = needSchema.parse({
      id: "hunger",
      name: "Hunger",
      decayPerTick: 0.1,
      criticalThreshold: 20,
    });
    expect(need).toMatchObject({
      decayPerTick: 100,
      criticalThreshold: 20000,
      satisfactionMethods: [],
    });
    expect(needSchema.safeParse({ ...need, criticalThreshold: 120 }).success).toBe(false);
  });
});

describe("skillSchema", () => {
  const skill = {
    id: "baking",
    name: "Baking",
    baseGrowthPerCompletion: 2,
    diminishingReturnsThreshold: 60,
    diminishingFactor: 0.4,
    outcomeEffects: [{ kind: "output_bonus", value: 1 }],
    titleNoun: "Baker",
  };

  it("accepts the faith_bonus and trade_margin effects (D-90)", () => {
    const parsed = skillSchema.parse({
      ...skill,
      outcomeEffects: [
        { kind: "faith_bonus", value: 5 },
        { kind: "trade_margin", value: 0.05 },
      ],
    });
    expect(parsed.outcomeEffects).toEqual([
      { kind: "faith_bonus", value: 5000 },
      { kind: "trade_margin", value: 50 },
    ]);
  });

  // @covers 028:FR-006
  it("converts growth and factors and demands an effect and a title noun", () => {
    expect(skillSchema.parse(skill)).toMatchObject({
      baseGrowthPerCompletion: 2000,
      diminishingFactor: 400,
      outcomeEffects: [{ kind: "output_bonus", value: 1000 }],
    });
    expect(skillSchema.safeParse({ ...skill, outcomeEffects: [] }).success).toBe(false);
    expect(skillSchema.safeParse({ ...skill, titleNoun: "" }).success).toBe(false);
    expect(skillSchema.safeParse({ ...skill, diminishingReturnsThreshold: 101 }).success).toBe(
      false,
    );
  });
});

describe("traitSchema", () => {
  it("accepts the three modifier kinds and the ALL wildcards", () => {
    const trait = traitSchema.parse({
      id: "mixed",
      name: "Mixed",
      modifiers: [
        { kind: "skill_aptitude", skill: "ALL", growthMultiplier: 1.2, startingValueBonus: 10 },
        { kind: "performance", skill: "ALL_WORK", stat: "speed_multiplier", value: 1.1 },
        { kind: "need_modifier", need: "mood", moodBonus: 5 },
      ],
    });
    expect(trait.modifiers[0]).toMatchObject({ growthMultiplier: 1200, startingValueBonus: 10000 });
    expect(trait.modifiers[2]).toMatchObject({ decayRateMultiplier: 1000, moodBonus: 5000 });
  });

  it("allows negative values on additive stats only and defaults extended to false (D-91, D-92)", () => {
    const base = { id: "clumsy", name: "Clumsy" };
    const performance = (stat: string, value: number) => ({
      ...base,
      modifiers: [{ kind: "performance", skill: "ALL_CRAFTING", stat, value }],
    });
    const parsed = traitSchema.parse(performance("output_bonus", -0.3));
    expect(parsed.modifiers[0]).toMatchObject({ value: -300 });
    expect(parsed.extended).toBe(false);
    expect(
      traitSchema.parse({ ...performance("margin_add", -0.05), extended: true }).extended,
    ).toBe(true);
    expect(traitSchema.safeParse(performance("multiplier", -0.3)).success).toBe(false);
    expect(traitSchema.safeParse(performance("speed_multiplier", -1)).success).toBe(false);
  });

  it("rejects unknown kinds, wildcards in aptitudes beyond ALL and empty lists", () => {
    const base = { id: "bad", name: "Bad" };
    expect(traitSchema.safeParse({ ...base, modifiers: [] }).success).toBe(false);
    expect(traitSchema.safeParse({ ...base, modifiers: [{ kind: "magic" }] }).success).toBe(false);
    expect(
      traitSchema.safeParse({
        ...base,
        modifiers: [{ kind: "skill_aptitude", skill: "ALL_WORK", growthMultiplier: 1 }],
      }).success,
    ).toBe(false);
  });
});

describe("humanoidPrototypeSchema", () => {
  const humanoid = { id: "farmer", name: "Farmer", behaviorTreeId: "basic_needs" };

  // @covers 022:FR-020
  it("applies defaults, scales skills and bounds trait slots", () => {
    expect(
      humanoidPrototypeSchema.parse({ ...humanoid, startingSkills: { farming: 30 } }),
    ).toMatchObject({
      startingSkills: { farming: 30000 },
      traitSlots: 2,
      nameListId: "common_13c",
      inventorySlots: 8,
      sellsItems: false,
      drawExtendedTraits: false,
    });
    expect(humanoidPrototypeSchema.safeParse({ ...humanoid, traitSlots: 0 }).success).toBe(false);
    expect(
      humanoidPrototypeSchema.safeParse({
        ...humanoid,
        traitSlots: 1,
        defaultTraitIds: ["strong", "weak"],
      }).success,
    ).toBe(false);
    expect(
      humanoidPrototypeSchema.safeParse({ ...humanoid, startingSkills: { farming: 101 } }).success,
    ).toBe(false);
  });
});

describe("animalPrototypeSchema", () => {
  it("accepts livestock and wild animals", () => {
    const sheep = { id: "sheep", name: "Sheep", kind: "livestock", behaviorTreeId: "livestock" };
    expect(animalPrototypeSchema.parse(sheep).threatLevel).toBe(0);
    expect(animalPrototypeSchema.safeParse({ ...sheep, kind: "pet" }).success).toBe(false);
  });

  it("defaults the behavior fields (D-140) and rejects negative radii", () => {
    const wolf = animalPrototypeSchema.parse({
      id: "wolf",
      name: "Wolf",
      kind: "wild",
      behaviorTreeId: "predator_behavior",
    });
    expect(wolf).toMatchObject({
      dietTerrainIds: [],
      preyIds: [],
      productIntervalTicks: 0,
      fleeRadiusCost: 0,
      detectionRadiusCost: 0,
      aggressive: false,
    });
    expect(animalPrototypeSchema.safeParse({ ...wolf, detectionRadiusCost: -1 }).success).toBe(
      false,
    );
    expect(
      animalPrototypeSchema.parse({ ...wolf, preyIds: ["sheep"], aggressive: true }),
    ).toMatchObject({ preyIds: ["sheep"], aggressive: true });
  });
});

describe("factionSchema", () => {
  const guild = {
    id: "guild_bakers",
    name: "Bakers",
    factionType: "occupational",
    leaderTitle: "Master",
    disposition: "mercantile",
    membership: { skillId: "baking", minLevel: 15 },
  };

  // @covers 028:FR-006
  it("defaults the master threshold to 60 and requires it to exceed the membership minimum", () => {
    expect(factionSchema.parse(guild).masterSkillThreshold).toBe(60);
    expect(factionSchema.safeParse({ ...guild, masterSkillThreshold: 15 }).success).toBe(false);
    expect(factionSchema.safeParse({ ...guild, masterSkillThreshold: 16 }).success).toBe(true);
  });
});

describe("nameListSchema", () => {
  const list = { id: "common", givenNames: [{ name: "Ada", weight: 1 }], bynames: ["Hill"] };

  // @covers 028:FR-001
  it("rejects duplicates ignoring case", () => {
    expect(nameListSchema.safeParse(list).success).toBe(true);
    expect(
      nameListSchema.safeParse({
        ...list,
        givenNames: [
          { name: "Ada", weight: 1 },
          { name: "ADA", weight: 1 },
        ],
      }).success,
    ).toBe(false);
    expect(nameListSchema.safeParse({ ...list, bynames: ["Hill", "hill"] }).success).toBe(false);
  });
});
