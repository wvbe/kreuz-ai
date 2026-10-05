import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { ContentTable } from "../content/ContentTable";
import { getComponent } from "../ecs/Entity";
import { GameEngine } from "../engine/GameEngine";
import { Prng } from "../engine/Prng";
import { skillsComponent, traitsComponent } from "./skillsComponent";
import { traitStreamName } from "./skillTypes";
import { createTestSkillContent, testTraits } from "./testSkillContent";
import { drawTraitIds, initializeCharacter } from "./traitAssignment";

const content = createTestSkillContent();

function stream(seed: number) {
  return Prng.create({ seed }).stream(traitStreamName);
}

describe("drawTraitIds", () => {
  it("draws 1 to 3 distinct ascending traits weighted 50/35/15", () => {
    const rolls = stream(1);
    const counts = [0, 0, 0, 0];
    for (let draw = 0; draw < 3000; draw += 1) {
      const ids = drawTraitIds(content, rolls, 3);
      counts[ids.length] = (counts[ids.length] ?? 0) + 1;
      expect(ids).toEqual([...new Set(ids)].sort());
    }
    expect(counts[0]).toBe(0);
    expect(counts[1]).toBeGreaterThan(1350);
    expect(counts[1]).toBeLessThan(1650);
    expect(counts[2]).toBeGreaterThan(900);
    expect(counts[2]).toBeLessThan(1200);
    expect(counts[3]).toBeGreaterThan(300);
    expect(counts[3]).toBeLessThan(600);
  });

  it("never exceeds the prototype's trait slots", () => {
    const rolls = stream(2);
    for (let draw = 0; draw < 200; draw += 1) {
      expect(drawTraitIds(content, rolls, 1)).toHaveLength(1);
      expect(drawTraitIds(content, rolls, 2).length).toBeLessThanOrEqual(2);
    }
  });

  it("never pairs traits that conflict in either direction", () => {
    const rolls = stream(3);
    for (let draw = 0; draw < 1000; draw += 1) {
      const ids = drawTraitIds(content, rolls, 3);
      expect(ids.includes("quick_learner") && ids.includes("slow_learner")).toBe(false);
    }
  });

  it("returns fewer traits when the registry runs out of compatible ones", () => {
    const small = {
      ...content,
      traits: new ContentTable("traits", testTraits.slice(0, 1), (record) => record.id),
    };
    const rolls = stream(4);
    for (let draw = 0; draw < 50; draw += 1) {
      expect(drawTraitIds(small, rolls, 3)).toEqual(["gifted_baker"]);
    }
  });

  it("is deterministic for a stream and differs between seeds", () => {
    const run = (seed: number) => {
      const rolls = stream(seed);
      return Array.from({ length: 20 }, () => drawTraitIds(content, rolls, 3));
    };
    expect(run(7)).toEqual(run(7));
    expect(run(7)).not.toEqual(run(8));
  });
});

function startEngine(seed: number): GameEngine {
  const engine = new GameEngine(loadContent(), { entropy: () => 1 });
  engine.newGame({ seed });
  return engine;
}

describe("initializeCharacter", () => {
  it("keeps authored traits, adds their starting bonus and does not draw", () => {
    const engine = startEngine(3);
    const baker = engine.store.spawn("baker");
    initializeCharacter(engine, baker.id);
    expect(getComponent(baker, traitsComponent)?.ids).toEqual(["born_baker"]);
    expect(getComponent(baker, skillsComponent)?.values).toEqual({ baking: 40_000 });
    expect(Object.keys(engine.prng.serialize().streams)).not.toContain(traitStreamName);
  });

  it("clamps the starting bonus at level 100", () => {
    const engine = startEngine(3);
    const baker = engine.store.spawn("baker", { Skills: { values: { baking: 98_000 } } });
    initializeCharacter(engine, baker.id);
    expect(getComponent(baker, skillsComponent)?.values["baking"]).toBe(100_000);
  });

  it("draws 1 to 2 traits for prototypes without authored ones", () => {
    const engine = startEngine(3);
    for (let index = 0; index < 20; index += 1) {
      const peasant = engine.store.spawn("peasant");
      initializeCharacter(engine, peasant.id);
      const ids = getComponent(peasant, traitsComponent)?.ids ?? [];
      expect(ids.length).toBeGreaterThanOrEqual(1);
      expect(ids.length).toBeLessThanOrEqual(2);
      for (const id of ids) {
        expect(engine.content.traits.has(id)).toBe(true);
      }
    }
  });

  it("draws the same traits on two engines with the same seed", () => {
    const traitsOfRun = (seed: number) => {
      const engine = startEngine(seed);
      return Array.from({ length: 12 }, () => {
        const peasant = engine.store.spawn("peasant");
        initializeCharacter(engine, peasant.id);
        return getComponent(peasant, traitsComponent)?.ids ?? [];
      });
    };
    expect(traitsOfRun(11)).toEqual(traitsOfRun(11));
    expect(traitsOfRun(11)).not.toEqual(traitsOfRun(12));
  });

  it("leaves entities without character components alone", () => {
    const engine = startEngine(3);
    const board = engine.store.spawn("job_board");
    initializeCharacter(engine, board.id);
    expect(board.components["Traits"]).toBeUndefined();
    expect(Object.keys(engine.prng.serialize().streams)).not.toContain(traitStreamName);
  });
});
