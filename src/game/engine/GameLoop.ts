/**
 * Tick-based game loop that advances simulation state.
 * Calls registered systems in order each tick.
 */

import type { EntityManager } from "./EntityManager.js";
import type { EventBusState } from "./EventBus.js";
import type { PrngState } from "./Prng.js";

export type GameState = {
  tick: number;
  entities: EntityManager;
  eventBus: EventBusState;
  prng: PrngState;
  maps: Map<string, unknown>;
  paused: boolean;
  speed: number;
};

export type SystemFunction = (state: GameState) => void;

export type GameLoopState = {
  systems: SystemFunction[];
  tickCount: number;
};

/**
 * Creates a new game loop.
 */
export function createGameLoop(): GameLoopState {
  return {
    systems: [],
    tickCount: 0,
  };
}

/**
 * Registers a system to run each tick.
 */
export function registerSystem(loop: GameLoopState, system: SystemFunction): void {
  loop.systems.push(system);
}

/**
 * Advances the game state by one tick, calling all systems in order.
 */
export function tick(loop: GameLoopState, state: GameState): void {
  if (state.paused) return;
  state.tick++;
  loop.tickCount++;
  for (const system of loop.systems) {
    system(state);
  }
}

/**
 * Advances the game state by multiple ticks.
 */
export function tickMultiple(loop: GameLoopState, state: GameState, count: number): void {
  for (let index = 0; index < count; index++) {
    tick(loop, state);
  }
}
