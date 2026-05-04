import { describe, it, expect, vi } from "vitest";
import { createGameLoop, registerSystem, tick, tickMultiple } from "./GameLoop.js";
import { createEntityManager } from "./EntityManager.js";
import { createEventBus } from "./EventBus.js";
import { createPrng } from "./Prng.js";
import type { GameState } from "./GameLoop.js";

function createTestState(): GameState {
  return {
    tick: 0,
    entities: createEntityManager(),
    eventBus: createEventBus(),
    prng: createPrng(42),
    maps: new Map(),
    paused: false,
    speed: 1,
  };
}

describe("GameLoop", () => {
  it("increments tick counter", () => {
    const loop = createGameLoop();
    const state = createTestState();
    tick(loop, state);
    expect(state.tick).toBe(1);
    tick(loop, state);
    expect(state.tick).toBe(2);
  });

  it("calls systems in order", () => {
    const loop = createGameLoop();
    const order: number[] = [];
    registerSystem(loop, () => order.push(1));
    registerSystem(loop, () => order.push(2));
    registerSystem(loop, () => order.push(3));
    const state = createTestState();
    tick(loop, state);
    expect(order).toEqual([1, 2, 3]);
  });

  it("does not tick when paused", () => {
    const loop = createGameLoop();
    const system = vi.fn();
    registerSystem(loop, system);
    const state = createTestState();
    state.paused = true;
    tick(loop, state);
    expect(state.tick).toBe(0);
    expect(system).not.toHaveBeenCalled();
  });

  it("tickMultiple advances by given count", () => {
    const loop = createGameLoop();
    const state = createTestState();
    tickMultiple(loop, state, 10);
    expect(state.tick).toBe(10);
  });

  it("produces deterministic results", () => {
    const loop = createGameLoop();
    const values: number[] = [];
    registerSystem(loop, (state) => values.push(state.tick));
    const state = createTestState();
    tickMultiple(loop, state, 5);
    expect(values).toEqual([1, 2, 3, 4, 5]);
  });
});
