import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadContent } from "../../src/game/content/ContentLoader";
import {
  FactionType,
  moodNeedId,
  SkillEffectKind,
  TraitModifierKind,
} from "../../src/game/content/contentTypes";

const content = loadContent();
const crossrefs = readFileSync("docs/content-crossrefs-5.3.md", "utf8");

const specSkills = [
  "farming",
  "mining",
  "woodcutting",
  "masonry",
  "smithing",
  "carpentry",
  "weaving",
  "tailoring",
  "leatherworking",
  "baking",
  "brewing",
  "cooking",
  "fishing",
  "herbalism",
  "animal_husbandry",
  "trading",
  "combat",
  "construction",
  "hauling",
  "preaching",
  "glassblowing",
];

const specHumanoids = [
  "peasant",
  "farmer",
  "blacksmith",
  "carpenter",
  "mason",
  "baker",
  "brewer",
  "weaver",
  "tanner",
  "potter",
  "cook",
  "fisherman",
  "herbalist",
  "miner",
  "lumberjack",
  "shepherd",
  "guard",
  "soldier",
  "merchant",
  "priest",
  "monk",
  "scholar",
  "noble",
];

const specGuilds = [
  "guild_bakers",
  "guild_smiths",
  "guild_masons",
  "guild_carpenters",
  "guild_weavers",
  "guild_tanners",
  "guild_brewers",
  "guild_merchants",
  "guild_potters",
];

const specReligious = ["parish_church", "monastic_order", "mendicant_friars"];

describe("skills (spec 022 FR-006)", () => {
  it("has the 21 spec skills, each with growth, an effect and a title noun", () => {
    expect(content.skills.ids()).toEqual(expect.arrayContaining(specSkills));
    expect(content.skills.size).toBeGreaterThanOrEqual(21);
    for (const skill of content.skills.all()) {
      expect(skill.outcomeEffects.length).toBeGreaterThanOrEqual(1);
      expect(skill.titleNoun.length).toBeGreaterThan(0);
      expect(skill.baseGrowthPerCompletion).toBeGreaterThan(0);
      expect(skill.diminishingReturnsThreshold).toBeLessThanOrEqual(100);
    }
  });

  it("covers agriculture, crafting, combat, trade and social domains", () => {
    for (const skillId of ["farming", "smithing", "combat", "trading", "preaching"]) {
      expect(content.skills.has(skillId)).toBe(true);
    }
  });

  it("gives preaching a faith bonus and trading a trade margin effect (D-90)", () => {
    expect(content.skills.require("preaching").outcomeEffects).toEqual([
      { kind: SkillEffectKind.FaithBonus, value: 5000 },
    ]);
    expect(
      content.skills
        .require("trading")
        .outcomeEffects.some((effect) => effect.kind === SkillEffectKind.TradeMargin),
    ).toBe(true);
  });

  it("records a link row for every skill in the crossref document", () => {
    for (const skillId of content.skills.ids()) {
      expect(crossrefs).toContain(`| ${skillId} |`);
    }
  });

  it("uses every skill referenced by a recipe or job type", () => {
    for (const recipe of content.recipes.all()) {
      if (recipe.skillId !== null) {
        expect(content.skills.has(recipe.skillId)).toBe(true);
      }
    }
    for (const job of content.jobs.all()) {
      if (job.skillId !== null) {
        expect(content.skills.has(job.skillId)).toBe(true);
      }
    }
  });
});

describe("traits (spec 022 FR-007)", () => {
  const primary = (id: string): TraitModifierKind =>
    content.traits.require(id).modifiers[0]?.kind ?? TraitModifierKind.Performance;

  it("has the 31 spec traits plus greedy, split over the three modifier kinds", () => {
    expect(content.traits.size).toBeGreaterThanOrEqual(32);
    const kinds = content.traits.ids().map(primary);
    const count = (kind: TraitModifierKind) => kinds.filter((entry) => entry === kind).length;
    expect(count(TraitModifierKind.SkillAptitude)).toBeGreaterThanOrEqual(12);
    expect(count(TraitModifierKind.Performance)).toBeGreaterThanOrEqual(7);
    expect(count(TraitModifierKind.NeedModifier)).toBeGreaterThanOrEqual(12);
  });

  it("keeps the original eight traits in the base draw pool (D-91)", () => {
    const original = [
      "greedy",
      "hearty",
      "born_baker",
      "quick_learner",
      "slow_learner",
      "strong",
      "tireless",
      "weak",
    ];
    for (const id of original) {
      expect(content.traits.require(id).extended).toBe(false);
    }
    expect(content.traits.all().filter((trait) => !trait.extended)).toHaveLength(8);
  });

  it("pairs opposite traits as conflicts so a character never gets both", () => {
    const conflict = (left: string, right: string) =>
      content.traits.require(left).conflictsWith.includes(right) ||
      content.traits.require(right).conflictsWith.includes(left);
    expect(conflict("quick", "slow")).toBe(true);
    expect(conflict("meticulous", "clumsy")).toBe(true);
    expect(conflict("tireless", "lethargic")).toBe(true);
    expect(conflict("hearty", "ravenous")).toBe(true);
    expect(conflict("gregarious", "solitary")).toBe(true);
    expect(conflict("devout", "skeptical")).toBe(true);
    expect(conflict("brave", "cowardly")).toBe(true);
    expect(conflict("generous", "miserly")).toBe(true);
  });

  it("expresses generous and miserly through the mood pseudo need", () => {
    for (const id of ["generous", "miserly"]) {
      expect(content.traits.require(id).modifiers).toEqual([
        expect.objectContaining({ kind: TraitModifierKind.NeedModifier, need: moodNeedId }),
      ]);
    }
    expect(content.needs.has(moodNeedId)).toBe(false);
  });
});

describe("needs (spec 022 FR-008)", () => {
  it("has the six needs; mood is a pseudo need, not a record", () => {
    expect(content.needs.ids().sort()).toEqual([
      "comfort",
      "faith",
      "hunger",
      "rest",
      "safety",
      "social",
    ]);
  });
});

describe("humanoid prototypes (spec 022 FR-005)", () => {
  it("has the 23 spec prototypes", () => {
    expect(content.humanoids.ids()).toEqual(expect.arrayContaining(specHumanoids));
    expect(content.humanoids.size).toBeGreaterThanOrEqual(23);
  });

  it("gives the blacksmith smithing 30 and mining 10 only", () => {
    expect(content.humanoids.require("blacksmith").startingSkills).toEqual({
      smithing: 30000,
      mining: 10000,
    });
  });

  it("marks the merchant as a seller and attaches priest and monk to their orders", () => {
    expect(content.humanoids.require("merchant").sellsItems).toBe(true);
    expect(content.humanoids.require("priest").defaultFactionIds).toEqual(["parish_church"]);
    expect(content.humanoids.require("monk").defaultFactionIds).toEqual(["monastic_order"]);
  });

  it("orders needs by role (spec need priority table)", () => {
    expect(content.humanoids.require("priest").needPriority?.slice(0, 2)).toEqual([
      "faith",
      "social",
    ]);
    expect(content.humanoids.require("guard").needPriority?.[0]).toBe("safety");
    expect(content.humanoids.require("merchant").needPriority?.[0]).toBe("social");
    expect(content.humanoids.require("noble").needPriority?.[0]).toBe("comfort");
  });

  it("differentiates peasant and noble by skills, equipment and coins", () => {
    const peasant = content.humanoids.require("peasant");
    const noble = content.humanoids.require("noble");
    expect(noble.startingSkills).not.toEqual(peasant.startingSkills);
    expect(noble.equipment).not.toEqual(peasant.equipment);
    expect(noble.equipment).toContainEqual({ materialId: "silver_penny", quantity: 200 });
  });

  it("draws extended traits only for the new prototypes (D-91)", () => {
    for (const id of ["peasant", "farmer", "carpenter", "baker"]) {
      expect(content.humanoids.require(id).drawExtendedTraits).toBe(false);
    }
    const extended = content.humanoids.all().filter((humanoid) => humanoid.drawExtendedTraits);
    expect(extended).toHaveLength(content.humanoids.size - 4);
  });

  it("references only skills, traits and factions of the pack", () => {
    for (const humanoid of content.humanoids.all()) {
      for (const skillId of Object.keys(humanoid.startingSkills)) {
        expect(content.skills.has(skillId)).toBe(true);
      }
      for (const traitId of humanoid.defaultTraitIds) {
        expect(content.traits.has(traitId)).toBe(true);
      }
      for (const factionId of humanoid.defaultFactionIds) {
        expect(content.factions.has(factionId)).toBe(true);
      }
    }
  });
});

describe("factions (spec 022 FR-012, FR-013)", () => {
  const partOfSettlement = (id: string) => content.factions.require(id).npc === undefined;

  it("has the nine guilds with a master threshold above the membership level", () => {
    const guilds = content.factions
      .all()
      .filter((faction) => faction.factionType === FactionType.Occupational);
    expect(guilds.map((guild) => guild.id).sort()).toEqual([...specGuilds].sort());
    for (const guild of guilds) {
      expect(guild.membership).toBeDefined();
      expect(guild.masterSkillThreshold).toBeGreaterThan(guild.membership?.minLevel ?? 100);
      expect(content.skills.has(guild.membership?.skillId ?? "")).toBe(true);
    }
  });

  it("has the three religious factions of the settlement beside the NPC abbey", () => {
    const religious = content.factions
      .all()
      .filter((faction) => faction.factionType === FactionType.Religious);
    const own = religious.filter((faction) => partOfSettlement(faction.id));
    expect(own.map((faction) => faction.id).sort()).toEqual([...specReligious].sort());
    expect(religious.map((faction) => faction.id)).toContain("wulfric_abbey");
    expect(content.factions.require("monastic_order").disposition).toBe("isolationist");
  });

  it("keeps the ids diplomacy uses", () => {
    for (const id of ["merchant_caravans", "ashford_barony", "wulfric_abbey"]) {
      expect(content.factions.require(id).npc).toBeDefined();
    }
  });
});

describe("name lists (spec 022 FR-021, spec 028)", () => {
  it("meets the size minimum with no duplicates and no title noun as byname", () => {
    const list = content.nameLists.require("common_13c");
    expect(list.givenNames.length).toBeGreaterThanOrEqual(60);
    expect(list.bynames.length).toBeGreaterThanOrEqual(40);
    const given = list.givenNames.map((entry) => entry.name.toLowerCase());
    expect(new Set(given).size).toBe(given.length);
    const bynames = list.bynames.map((entry) => entry.toLowerCase());
    expect(new Set(bynames).size).toBe(bynames.length);
    const nouns = new Set(content.skills.all().map((skill) => skill.titleNoun.toLowerCase()));
    expect(bynames.filter((byname) => nouns.has(byname))).toEqual([]);
  });

  it("has every prototype name list in the registry", () => {
    for (const humanoid of content.humanoids.all()) {
      expect(content.nameLists.has(humanoid.nameListId)).toBe(true);
    }
  });
});
