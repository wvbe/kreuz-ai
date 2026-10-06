import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { ContentTable } from "../content/ContentTable";
import { getComponent } from "../ecs/Entity";
import { GameEngine } from "../engine/GameEngine";
import {
  applySkillWork,
  emitSkillWorkCompleted,
  growthDeltaMilli,
  skillWorkCompletedSchema,
} from "./skillGrowth";
import { SkillError, SkillErrorKind } from "./SkillError";
import { skillsComponent } from "./skillsComponent";
import { skillIncreasedEvent, skillWorkCompletedEvent } from "./skillTypes";
import type { SkillIncreased } from "./skillTypes";
import { createTestCharacter, createTestSkillContent, testSkills } from "./testSkillContent";

const content = createTestSkillContent();

// @covers 020:FR-005 020:FR-006 020:SC-002 020:SC-004 020:SC-007
describe("growthDeltaMilli", () => {
  it("is the base growth below the threshold (2 points at level 10)", () => {
    expect(growthDeltaMilli(content, createTestCharacter({ baking: 10 }), "baking")).toBe(2000);
    expect(growthDeltaMilli(content, createTestCharacter({ baking: 49 }), "baking")).toBe(2000);
  });

  it("applies the diminishing factor from the threshold on (0.5 points at 90)", () => {
    expect(growthDeltaMilli(content, createTestCharacter({ baking: 50 }), "baking")).toBe(500);
    expect(growthDeltaMilli(content, createTestCharacter({ baking: 90 }), "baking")).toBe(500);
  });

  it("multiplies aptitude traits, 50 percent faster with Gifted Baker (US3 AC1)", () => {
    const gifted = createTestCharacter({ baking: 10 }, ["gifted_baker"]);
    expect(growthDeltaMilli(content, gifted, "baking")).toBe(3000);
    expect(growthDeltaMilli(content, gifted, "hauling")).toBe(2000);
  });

  it("stacks three aptitude traits on the same skill (US3 AC6)", () => {
    const entity = createTestCharacter({}, ["gifted_baker", "quick_learner", "slow_learner"]);
    expect(growthDeltaMilli(content, entity, "baking")).toBe(2880);
  });

  it("accumulates fractional growth: 0.5 per completion gives level 10 after exactly 20", () => {
    const slow = {
      ...content,
      skills: new ContentTable(
        "skills",
        testSkills.map((skill) => ({ ...skill, baseGrowthPerCompletion: 500 })),
        (record) => record.id,
      ),
    };
    const entity = createTestCharacter({});
    let completions = 0;
    while (Math.floor((getComponent(entity, skillsComponent)?.values["baking"] ?? 0) / 1000) < 10) {
      const values = getComponent(entity, skillsComponent)?.values ?? {};
      values["baking"] = (values["baking"] ?? 0) + growthDeltaMilli(slow, entity, "baking");
      completions += 1;
    }
    expect(completions).toBe(20);
  });

  it("shows diminishing returns: growth from 10 is below growth from 0 over the same completions", () => {
    const grow = (start: number) => {
      const entity = createTestCharacter({ baking: start });
      const values = getComponent(entity, skillsComponent)?.values ?? {};
      for (let completion = 0; completion < 30; completion += 1) {
        values["baking"] = (values["baking"] ?? 0) + growthDeltaMilli(content, entity, "baking");
      }
      return (values["baking"] ?? 0) - start * 1000;
    };
    expect(grow(40)).toBeLessThan(grow(0));
  });
});

describe("skillWorkCompletedSchema", () => {
  it("accepts the payload and rejects bad ones", () => {
    expect(skillWorkCompletedSchema.safeParse({ entityId: 3, skillId: "baking" }).success).toBe(
      true,
    );
    expect(skillWorkCompletedSchema.safeParse({ entityId: 0, skillId: "baking" }).success).toBe(
      false,
    );
    expect(skillWorkCompletedSchema.safeParse({ entityId: 1, skillId: "" }).success).toBe(false);
    expect(
      skillWorkCompletedSchema.safeParse({ entityId: 1, skillId: "baking", extra: 1 }).success,
    ).toBe(false);
  });
});

function startEngine(): { engine: GameEngine; workerId: number } {
  const engine = new GameEngine(loadContent(), { entropy: () => 1 });
  engine.newGame({ seed: 5 });
  return { engine, workerId: engine.store.spawn("peasant").id };
}

describe("emitSkillWorkCompleted", () => {
  it("queues skill.work.completed with entity and skill", () => {
    const { engine, workerId } = startEngine();
    engine.bus.processQueue();
    emitSkillWorkCompleted(engine.bus, workerId, "farming");
    expect(engine.bus.getQueue()).toEqual([
      { name: skillWorkCompletedEvent, payload: { entityId: workerId, skillId: "farming" } },
    ]);
  });
});

describe("applySkillWork", () => {
  function level(engine: GameEngine, workerId: number, skillId: string): number {
    return Math.floor(
      (getComponent(engine.store.require(workerId), skillsComponent)?.values[skillId] ?? 0) / 1000,
    );
  }

  it("adds growth and emits skill.increased only on a level change", () => {
    const { engine, workerId } = startEngine();
    engine.bus.processQueue();
    const increases: SkillIncreased[] = [];
    engine.bus.subscribe<SkillIncreased>(skillIncreasedEvent, (payload) => increases.push(payload));
    // peasant: farming 5 -> 7 after one completion (2.0), level changes each time.
    expect(applySkillWork(engine, workerId, "farming")).toBe(7000);
    engine.bus.processQueue();
    expect(increases).toEqual([
      { entityId: workerId, skillId: "farming", oldValue: 5, newValue: 7 },
    ]);
    expect(level(engine, workerId, "farming")).toBe(7);
  });

  it("emits nothing when the growth stays inside the level", () => {
    const { engine, workerId } = startEngine();
    const skills = getComponent(engine.store.require(workerId), skillsComponent);
    if (skills === undefined) {
      throw new Error("peasant has no Skills");
    }
    skills.values["farming"] = 60_000;
    engine.bus.processQueue();
    const increases: SkillIncreased[] = [];
    engine.bus.subscribe<SkillIncreased>(skillIncreasedEvent, (payload) => increases.push(payload));
    // above the threshold each completion adds 0.5: the level changes every second completion.
    applySkillWork(engine, workerId, "farming");
    engine.bus.processQueue();
    expect(increases).toEqual([]);
    applySkillWork(engine, workerId, "farming");
    engine.bus.processQueue();
    expect(increases).toEqual([
      { entityId: workerId, skillId: "farming", oldValue: 60, newValue: 61 },
    ]);
  });

  it("caps at 100 and stops emitting there (US2 AC5)", () => {
    const { engine, workerId } = startEngine();
    const skills = getComponent(engine.store.require(workerId), skillsComponent);
    if (skills === undefined) {
      throw new Error("peasant has no Skills");
    }
    skills.values["farming"] = 99_800;
    engine.bus.processQueue();
    const increases: SkillIncreased[] = [];
    engine.bus.subscribe<SkillIncreased>(skillIncreasedEvent, (payload) => increases.push(payload));
    expect(applySkillWork(engine, workerId, "farming")).toBe(100_000);
    expect(applySkillWork(engine, workerId, "farming")).toBe(100_000);
    engine.bus.processQueue();
    expect(increases).toEqual([
      { entityId: workerId, skillId: "farming", oldValue: 99, newValue: 100 },
    ]);
  });

  it("starts unknown-to-the-entity skills at 0 (a new skill needs no migration)", () => {
    const { engine, workerId } = startEngine();
    expect(applySkillWork(engine, workerId, "masonry")).toBe(2000);
  });

  it("ignores missing entities and entities without Skills, rejects unknown skills", () => {
    const { engine } = startEngine();
    expect(applySkillWork(engine, 9999, "farming")).toBeNull();
    expect(applySkillWork(engine, 1, "farming")).toBeNull();
    expect(() => applySkillWork(engine, 1, "alchemy")).toThrow(SkillError);
    expect(() => applySkillWork(engine, 1, "alchemy")).toThrow(/unknown skill "alchemy"/);
    expect(new SkillError(SkillErrorKind.UnknownSkill, "x").kind).toBe("unknown-skill");
  });
});
