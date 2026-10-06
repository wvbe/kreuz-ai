import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createScenarioSession } from "../../src/game/api/scenario/createScenarioSession";
import { loadContent } from "../../src/game/content/ContentLoader";
import { DwellingLevel, SettlementTier } from "../../src/game/content/contentTypes";
import { tierRank } from "../../src/game/settlement/tierOrder";

// Spec 022 conformance (task 7.1 audit): the requirements about registries, data files and
// content rules that the unit tests do not name. The ids are tagged in `@covers` comments.

const content = loadContent();
const dataDirectory = join(__dirname, "..", "..", "src", "game", "content", "data");

function chainDepth(materialId: string, seen: ReadonlySet<string> = new Set()): number {
  if (seen.has(materialId)) {
    return 0;
  }
  const makers = content.recipes
    .all()
    .filter((recipe) => recipe.outputs.some((output) => output.materialId === materialId));
  if (makers.length === 0) {
    return 0;
  }
  const next = new Set(seen).add(materialId);
  return (
    1 +
    Math.max(
      ...makers.map((recipe) =>
        Math.max(0, ...recipe.inputs.map((input) => chainDepth(input.materialId, next))),
      ),
    )
  );
}

describe("spec 022 registries", () => {
  // @covers 022:FR-002
  it("has at least 55 recipes and chains of 3 tiers for metal, textile and food", () => {
    expect(content.recipes.size).toBeGreaterThanOrEqual(55);
    for (const category of ["metal", "textile", "food"]) {
      const depths = content.materials
        .ids()
        .filter((id) => content.materials.require(id).categories.includes(category))
        .map((id) => chainDepth(id));
      // depth counts recipe steps: raw -> processed -> finished is 2 steps and 3 tiers
      expect(Math.max(...depths), category).toBeGreaterThanOrEqual(2);
    }
  });

  // @covers 022:FR-004
  it("has at least 25 zone types of the required kinds", () => {
    const zones = content.zones.all();
    expect(zones.length).toBeGreaterThanOrEqual(25);
    const rooms = zones.filter((zone) => zone.requiresRoom);
    const openAir = zones.filter((zone) => !zone.requiresRoom);
    expect(openAir.length).toBeGreaterThanOrEqual(6);
    const production = rooms.filter((zone) => zone.activityUnlocks.length > 0);
    expect(production.length).toBeGreaterThanOrEqual(10);
    expect(zones.some((zone) => zone.id === "dwelling")).toBe(true);
    const religious = ["chapel", "church", "cloister", "cemetery"].filter((id) =>
      content.zones.has(id),
    );
    expect(religious.length).toBeGreaterThanOrEqual(3);
    const storage = ["stockpile", "pantry", "warehouse", "wine_cellar", "armory"].filter((id) =>
      content.zones.has(id),
    );
    expect(storage.length).toBeGreaterThanOrEqual(4);
  });

  // @covers 022:FR-009
  it("has at least 20 job types with valid skills and tools, covering the spec domains", () => {
    const jobs = content.jobs.all();
    expect(jobs.length).toBeGreaterThanOrEqual(20);
    for (const job of jobs) {
      if (job.skillId !== null) {
        expect(content.skills.has(job.skillId), `${job.id} skill`).toBe(true);
      }
      if (job.toolMaterialId !== null) {
        expect(content.materials.has(job.toolMaterialId), `${job.id} tool`).toBe(true);
      }
    }
    for (const prefix of [
      "farm.",
      "mine.",
      "craft.",
      "haul.",
      "build.",
      "guard.",
      "trade.",
      "preach.",
    ]) {
      expect(
        jobs.some((job) => job.id.startsWith(prefix)),
        prefix,
      ).toBe(true);
    }
  });

  // @covers 022:FR-024
  it("lets gathering jobs declare integer outputs of existing materials", () => {
    for (const id of [
      "fell.trees",
      "quarry.stone",
      "fish.catch",
      "gather.herbs",
      "tend.bees",
      "mine.ore",
    ]) {
      const job = content.jobs.require(id);
      expect(job.outputs.length, id).toBeGreaterThan(0);
      for (const output of job.outputs) {
        expect(content.materials.has(output.materialId), `${id} ${output.materialId}`).toBe(true);
        expect(Number.isInteger(output.quantity) && output.quantity > 0).toBe(true);
      }
    }
    // jobs that produce nothing leave the field empty
    expect(content.jobs.require("haul.deliver").outputs).toEqual([]);
  });
});

describe("spec 022 data rules", () => {
  // @covers 022:FR-017
  it("names no anachronistic item in any data file", () => {
    const forbidden =
      /gunpowder|musket|cannon|printing[_ ]press|potato|tomato|maize|corn_|tobacco|coffee|chocolate|pistol|rifle|dynamite|steam|clock_|telescope/i;
    for (const file of readdirSync(dataDirectory).filter((name) => name.endsWith(".json"))) {
      const text = readFileSync(join(dataDirectory, file), "utf8");
      const hit = forbidden.exec(text);
      expect(hit?.[0], file).toBeUndefined();
    }
  });

  // @covers 022:FR-019
  it("names data files in kebab-case and every id in lowercase snake_case", () => {
    for (const file of readdirSync(dataDirectory).filter((name) => name.endsWith(".json"))) {
      expect(file, file).toMatch(/^[a-z]+(-[a-z]+)*\.json$/);
    }
    const snake = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
    const registries = [
      content.materials.ids(),
      content.skills.ids(),
      content.traits.ids(),
      content.recipes.ids(),
      content.zones.ids(),
      content.furniture.ids(),
      content.factions.ids(),
      content.needs.ids(),
      content.behaviorTrees.ids(),
      content.humanoids.ids(),
      content.animals.ids(),
      content.terrainContent.ids(),
    ];
    for (const ids of registries) {
      for (const id of ids) {
        expect(id, id).toMatch(snake);
      }
    }
    for (const id of content.jobs.ids()) {
      expect(id, id).toMatch(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);
    }
  });

  // @covers 022:FR-020
  it("keeps skill levels and trait slots inside their ranges", () => {
    for (const skill of content.skills.all()) {
      expect(skill.diminishingReturnsThreshold).toBeGreaterThanOrEqual(0);
      expect(skill.diminishingReturnsThreshold).toBeLessThanOrEqual(100_000);
    }
    for (const humanoid of content.humanoids.all()) {
      expect(humanoid.traitSlots).toBeGreaterThanOrEqual(1);
      expect(humanoid.traitSlots).toBeLessThanOrEqual(3);
      for (const level of Object.values(humanoid.startingSkills)) {
        expect(level).toBeGreaterThanOrEqual(0);
        expect(level).toBeLessThanOrEqual(100_000);
      }
    }
  });

  // @covers 022:FR-023
  it("holds every constant the spec lists, within range", () => {
    const names = [
      "stewardReviewTickOfDay",
      "stewardAudienceTicks",
      "maxOpenRunsPerOrder",
      "maxStandingOrders",
      "defaultRestockFraction",
      "noticePostRadius",
      "bellRadius",
      "bellRingTicksOfDay",
      "housingEvaluationTickOfDay",
      "upgradeGraceDays",
      "downgradeGraceDays",
      "foodVarietyWindowDays",
      "householdStockDays",
      "maxImmigrantsPerDay",
      "minFoundingMembers",
      "titleThreshold",
      "titleSwitchMargin",
      "finestMinimumLevel",
      "finestCooldownDays",
      "bynameChance",
      "nameRedrawLimit",
      "journalCapacity",
      "chronicleCapacity",
    ];
    for (const name of names) {
      expect(name in content.constants, name).toBe(true);
    }
    expect(content.constants.downgradeGraceDays).toBeGreaterThan(
      content.constants.upgradeGraceDays,
    );
    expect(content.constants.housingEvaluationTickOfDay).toBe(72);
    expect(content.constants.minFoundingMembers).toBe(3);
  });

  // @covers 022:FR-022
  it("lets furniture, zones, recipes, jobs and dwelling levels declare an unlock tier", () => {
    expect(content.furniture.require("notice_post").unlockTier).toBe(SettlementTier.Village);
    expect(content.zones.require("bell_tower").unlockTier).toBe(SettlementTier.MarketTown);
    const kinds = [
      content.furniture.all(),
      content.zones.all(),
      content.recipes.all(),
      content.jobs.all(),
    ];
    for (const records of kinds) {
      for (const record of records) {
        if (record.unlockTier !== undefined) {
          expect(tierRank(record.unlockTier)).toBeGreaterThanOrEqual(0);
        }
      }
    }
    expect(content.dwellingLevels.size).toBe(Object.values(DwellingLevel).length);
  });

  // @covers 022:FR-018
  it("loads from static JSON imports: the loader reads no filesystem and imports a file per category", () => {
    const loader = readFileSync(
      join(__dirname, "..", "..", "src", "game", "content", "ContentLoader.ts"),
      "utf8",
    );
    expect(loader).not.toMatch(/from "node:fs"|readdirSync|readFileSync|import\(/);
    expect(loader.match(/^import \w+ from "\.\/data\/[a-z-]+\.json";$/gm)?.length).toBe(22);
  });
});

describe("spec 022 success criteria", () => {
  // @covers 022:SC-006
  it("lets at least 70% of the materials take part in a recipe", () => {
    const used = new Set<string>();
    for (const recipe of content.recipes.all()) {
      recipe.inputs.forEach((input) => used.add(input.materialId));
      recipe.outputs.forEach((output) => used.add(output.materialId));
    }
    const total = content.materials.ids().length;
    expect(used.size * 100).toBeGreaterThanOrEqual(total * 70);
  });

  // @covers 022:SC-004
  it("gives every humanoid prototype a tree that exists and needs it can satisfy", () => {
    for (const humanoid of content.humanoids.all()) {
      expect(content.behaviorTrees.has(humanoid.behaviorTreeId), humanoid.id).toBe(true);
    }
    // a need is satisfied by consumables (satisfactionMethods) or by the `<need>.bonus` effect of
    // furniture and zones
    const bonuses = new Set(
      [...content.furniture.all(), ...content.zones.all()].flatMap((record) =>
        record.effects.map((effect) => effect.modifierId),
      ),
    );
    for (const need of content.needs.all()) {
      const satisfiable = need.satisfactionMethods.length > 0 || bonuses.has(`${need.id}.bonus`);
      expect(satisfiable, need.id).toBe(true);
    }
  });

  // @covers 022:SC-005
  it("gives every faction a leader title and a disposition for the diplomacy system", () => {
    expect(content.factions.size).toBeGreaterThanOrEqual(11);
    for (const faction of content.factions.all()) {
      expect(faction.leaderTitle.length, faction.id).toBeGreaterThan(0);
      expect(faction.disposition.length, faction.id).toBeGreaterThan(0);
    }
  });

  // @covers 022:SC-008
  it("makes two seeds differ in terrain and in the traits of the settlers", () => {
    function profile(seed: number): { terrain: string; traits: string } {
      const session = createScenarioSession();
      session.newGame({ seed, mapSize: 1 });
      const count = session.query.map(1)?.cellCount ?? 0;
      const histogram: { [terrain: string]: number } = {};
      for (let cell = 0; cell < count; cell += 1) {
        const terrain = String(session.query.cell(1, cell)?.terrain);
        histogram[terrain] = (histogram[terrain] ?? 0) + 1;
      }
      const traits = session.engine
        .getEntities()
        .map((entity) => JSON.stringify(entity.components["Traits"] ?? null));
      return { terrain: JSON.stringify(histogram), traits: traits.join("|") };
    }
    const first = profile(42);
    const second = profile(7);
    expect(first.terrain).not.toBe(second.terrain);
    expect(first.traits).not.toBe(second.traits);
  });
});
