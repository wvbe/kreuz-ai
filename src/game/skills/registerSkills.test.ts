import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import { GameEngine } from "../engine/GameEngine";
import { GameEngineError, GameEngineErrorKind } from "../engine/GameEngineError";
import { MapSize } from "../map/mapSize";
import { registerSkills, skillsSystemId } from "./registerSkills";
import { emitSkillWorkCompleted } from "./skillGrowth";
import { skillsComponent, traitsComponent } from "./skillsComponent";
import { skillIncreasedEvent } from "./skillTypes";
import type { SkillIncreased } from "./skillTypes";
import { buildSkillsView } from "./skillViews";

function startEngine(seed: number): GameEngine {
  const engine = new GameEngine(loadContent(), { entropy: () => 1 });
  engine.newGame({ seed, mapSize: MapSize.Small });
  return engine;
}

function settlers(engine: GameEngine): Entity[] {
  return engine.store.entities().filter((entity) => engine.content.humanoids.has(entity.prototype));
}

function complete(engine: GameEngine, entityId: number, skillId: string, times: number): void {
  for (let count = 0; count < times; count += 1) {
    emitSkillWorkCompleted(engine.bus, entityId, skillId);
    engine.bus.processQueue();
  }
}

function skillValue(engine: GameEngine, entityId: number, skillId: string): number {
  return getComponent(engine.store.require(entityId), skillsComponent)?.values[skillId] ?? 0;
}

describe("registerSkills", () => {
  it("is part of every engine and idempotent", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    expect(skillsSystemId).toBe("skills");
    expect(() => registerSkills(engine)).not.toThrow();
    expect(engine.queryNames()).toEqual(expect.arrayContaining(["skills-of", "traits-of"]));
    expect(engine.components.has("Skills")).toBe(true);
    expect(engine.components.has("Traits")).toBe(true);
  });

  it("gives the starting settlers of a new game skills and traits", () => {
    const engine = startEngine(7);
    const team = settlers(engine);
    expect(team.map((settler) => settler.prototype)).toEqual([
      "farmer",
      "farmer",
      "carpenter",
      "baker",
      "peasant",
      "peasant",
    ]);
    for (const settler of team) {
      const traits = getComponent(settler, traitsComponent)?.ids ?? [];
      expect(traits.length).toBeGreaterThanOrEqual(1);
      expect(traits.length).toBeLessThanOrEqual(3);
    }
    const baker = team[3];
    expect(getComponent(baker as Entity, skillsComponent)?.values["baking"]).toBe(40_000);
    expect(
      getComponent(team[0] as Entity, skillsComponent)?.values["farming"],
    ).toBeGreaterThanOrEqual(30_000);
  });

  it("draws the same traits for the same seed", () => {
    const traitsOf = (seed: number) =>
      settlers(startEngine(seed)).map((settler) => getComponent(settler, traitsComponent)?.ids);
    expect(traitsOf(21)).toEqual(traitsOf(21));
    expect(traitsOf(21)).not.toEqual(traitsOf(22));
  });

  it("serves the skills-of and traits-of queries", () => {
    const engine = startEngine(7);
    const baker = settlers(engine)[3] as Entity;
    const skills = engine.getQuery("skills-of")?.run({ entityId: baker.id }, engine);
    expect(skills).toMatchObject({ entityId: baker.id, dominantSkill: "baking" });
    expect(skills).toMatchObject({
      skills: expect.arrayContaining([
        { skillId: "baking", name: "Baking", level: 40, valueMilli: 40_000 },
      ]),
    });
    expect(buildSkillsView(engine.content, baker)?.skills).toHaveLength(engine.content.skills.size);
    expect(engine.getQuery("traits-of")?.run({ entityId: baker.id }, engine)).toMatchObject({
      traits: [{ traitId: "born_baker", name: "Born baker" }],
    });
    expect(engine.getQuery("skills-of")?.run({ entityId: 9999 }, engine)).toBeNull();
    expect(engine.getQuery("traits-of")?.run({ entityId: 1 }, engine)).toBeNull();
    expect(engine.getQuery("skills-of")?.schema.safeParse({}).success).toBe(false);
  });

  it("grows skills when skill.work.completed is delivered and announces level-ups", () => {
    const engine = startEngine(7);
    const baker = (settlers(engine)[3] as Entity).id;
    const increases: SkillIncreased[] = [];
    engine.bus.subscribe<SkillIncreased>(skillIncreasedEvent, (payload) => increases.push(payload));
    complete(engine, baker, "baking", 3);
    // born_baker learns baking x1.5: 40.0 + 3 x 3.0 -> levels 43, 46, 49
    expect(skillValue(engine, baker, "baking")).toBe(49_000);
    expect(increases.map((event) => event.newValue)).toEqual([43, 46, 49]);
    expect(increases[0]).toEqual({
      entityId: baker,
      skillId: "baking",
      oldValue: 40,
      newValue: 43,
    });
  });

  it("grows only the completed skill (US2 AC3)", () => {
    const engine = startEngine(7);
    const carpenter = (settlers(engine)[2] as Entity).id;
    const before = skillValue(engine, carpenter, "carpentry");
    complete(engine, carpenter, "construction", 1);
    expect(skillValue(engine, carpenter, "carpentry")).toBe(before);
    expect(skillValue(engine, carpenter, "construction")).toBeGreaterThan(10_000);
  });

  it("reports bad payloads and unknown skills to the engine's error sink without throwing", () => {
    const engine = startEngine(7);
    engine.bus.emit("skill.work.completed", { entityId: 3 });
    engine.bus.emit("skill.work.completed", { entityId: 3, skillId: "alchemy" });
    expect(() => engine.bus.processQueue()).not.toThrow();
  });

  it("progresses identically on two engines and after a save/load mid-progress", () => {
    const first = startEngine(9);
    const baker = (settlers(first)[3] as Entity).id;
    complete(first, baker, "baking", 5);
    const save = first.saveGame();

    const second = new GameEngine(loadContent(), { entropy: () => 1 });
    second.loadGame(save);
    expect(skillValue(second, baker, "baking")).toBe(skillValue(first, baker, "baking"));
    expect(second.store.require(baker).components).toEqual(first.store.require(baker).components);

    complete(first, baker, "baking", 20);
    complete(second, baker, "baking", 20);
    expect(skillValue(second, baker, "baking")).toBe(skillValue(first, baker, "baking"));
    expect(skillValue(first, baker, "baking")).toBeLessThanOrEqual(100_000);
    const stripTimestamp = (text: string) => text.replace(/"savedAt":"[^"]*"/, "");
    expect(stripTimestamp(second.saveGame())).toBe(stripTimestamp(first.saveGame()));
  });

  it("keeps integer-only state", () => {
    const engine = startEngine(7);
    for (const settler of settlers(engine)) {
      for (const value of Object.values(getComponent(settler, skillsComponent)?.values ?? {})) {
        expect(Number.isInteger(value)).toBe(true);
      }
    }
  });

  it("rejects a save that names an unknown skill and keeps the current game", () => {
    const engine = startEngine(7);
    const save = engine.saveGame();
    const target = startEngine(8);
    const tick = target.getTime().tick;
    const failure = (broken: string) => {
      try {
        target.loadGame(broken);
      } catch (error) {
        return error;
      }
      return null;
    };
    const skillError = failure(save.replace(/"baking":\s*40000/, '"alchemy":40000'));
    expect(skillError).toBeInstanceOf(GameEngineError);
    expect((skillError as GameEngineError).kind).toBe(GameEngineErrorKind.InitFailed);
    expect((skillError as GameEngineError).message).toContain('unknown skill "alchemy"');
    const traitError = failure(save.replace('"born_baker"', '"ghost_trait"'));
    expect((traitError as GameEngineError).message).toContain('unknown trait "ghost_trait"');
    expect(target.getTime().tick).toBe(tick);
    expect(settlers(target)).toHaveLength(6);
  });
});
