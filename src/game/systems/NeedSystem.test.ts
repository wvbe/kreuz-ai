import { describe, it, expect } from "vitest";
import { createColonistNeeds, satisfyNeed, getMostUrgentNeed, hasCriticalNeed, updateNeeds } from "./NeedSystem";
import { createEntityManager, createEntity, addComponent } from "../engine/EntityManager";
import { createEventBus } from "../engine/EventBus";
import { createPrng } from "../engine/Prng";
import type { GameState } from "../engine/GameLoop";

describe("NeedSystem", () => {
  it("creates colonist needs with proper defaults", () => {
    const needs = createColonistNeeds();
    expect(needs.needs.length).toBe(6);
    expect(needs.needs[0]!.needId).toBe("hunger");
    expect(needs.needs[0]!.value).toBe(1.0);
  });

  it("decays needs over ticks", () => {
    const entities = createEntityManager();
    const entity = createEntity(entities);
    const needs = createColonistNeeds();
    addComponent(entities, entity, "needs", needs);

    const state: GameState = {
      tick: 1,
      entities,
      eventBus: createEventBus(),
      prng: createPrng(42),
      maps: new Map(),
      paused: false,
      speed: 1,
    };

    const originalHunger = needs.needs[0]!.value;
    updateNeeds(state);
    expect(needs.needs[0]!.value).toBeLessThan(originalHunger);
  });

  it("satisfies needs", () => {
    const needs = createColonistNeeds();
    needs.needs[0]!.value = 0.2; // hungry
    satisfyNeed(needs, "hunger", 0.5);
    expect(needs.needs[0]!.value).toBe(0.7);
  });

  it("caps need value at 1.0", () => {
    const needs = createColonistNeeds();
    satisfyNeed(needs, "hunger", 0.5);
    expect(needs.needs[0]!.value).toBe(1.0);
  });

  it("finds most urgent need", () => {
    const needs = createColonistNeeds();
    needs.needs[0]!.value = 0.1; // hunger critical
    needs.needs[1]!.value = 0.2; // thirst urgent
    const urgent = getMostUrgentNeed(needs);
    expect(urgent?.needId).toBe("hunger");
  });

  it("detects critical needs", () => {
    const needs = createColonistNeeds();
    expect(hasCriticalNeed(needs)).toBe(false);
    needs.needs[0]!.value = 0.05;
    expect(hasCriticalNeed(needs)).toBe(true);
  });
});
