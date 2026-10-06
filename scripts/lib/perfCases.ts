import { GameSession } from "../../src/game/api/GameSession";
import { createScenarioSession } from "../../src/game/api/scenario/createScenarioSession";
import { loadContent } from "../../src/game/content/ContentLoader";

// The measurable performance success criteria of the specs (plan task 7.1). Every case returns
// milliseconds (median of a few runs) so the same code serves `npm run perf` and the budget test
// in tests/integration/performanceBudgets.test.ts. Wall-clock numbers depend on the machine; the
// budgets of the test are generous multiples of what docs/PERFORMANCE.md records.

/**
 * Milliseconds on a monotonic clock.
 *
 * @returns Now, in milliseconds.
 */
export function nowMs(): number {
  return performance.now();
}

/**
 * Median of the milliseconds that `run` takes over `repeats` calls.
 *
 * @param repeats - How often to run it.
 * @param run - The work to measure.
 * @returns The median duration.
 */
export function medianMs(repeats: number, run: () => void): number {
  const times: number[] = [];
  for (let index = 0; index < repeats; index += 1) {
    const started = nowMs();
    run();
    times.push(nowMs() - started);
  }
  times.sort((left, right) => left - right);
  return times[Math.floor(times.length / 2)] ?? 0;
}

/**
 * Spec 007 SC-001: a headless game is bootstrapped and idle in under 100 ms (content parsed
 * already, no starting map; the second number includes the generated Small map).
 *
 * @returns Milliseconds for `new GameSession` plus `newGame`, without and with a map.
 */
export function measureBootstrap(): { bare: number; withMap: number } {
  const content = loadContent();
  const bare = medianMs(7, () => {
    new GameSession(content).newGame({ seed: 1 });
  });
  const withMap = medianMs(5, () => {
    new GameSession(content).newGame({ seed: 1, mapSize: 0 });
  });
  return { bare, withMap };
}

/**
 * Spec 007 SC-002: invalid initialization parameters are rejected in under 50 ms.
 *
 * @returns Milliseconds to reject a game with three bad options.
 */
export function measureOptionValidation(): number {
  const session = new GameSession(loadContent());
  return medianMs(9, () => {
    const result = session.newGame({ seed: -1, difficulty: "super-hard", mapSize: 99 });
    if (result.ok) {
      throw new Error("the invalid options were accepted");
    }
  });
}

/**
 * Builds a game with `citizens` settlers (the six founders and the rest spawned by the scenario
 * debug command on distinct traversable cells).
 *
 * @param citizens - Total number of citizens.
 * @returns The session, after the spawn tick.
 */
export function createSettlement(citizens: number): GameSession {
  const session = createScenarioSession();
  session.newGame({ seed: 42, difficulty: "peaceful", mapSize: 0 });
  const map = session.engine.maps.require(1);
  const taken = new Set(
    session.engine.store
      .entities()
      .map(
        (entity) => (entity.components["Position"] as { cellIndex: number } | undefined)?.cellIndex,
      )
      .filter((cell): cell is number => cell !== undefined),
  );
  const cells: number[] = [];
  for (let cell = 0; cell < map.cellCount && cells.length < citizens - 6; cell += 1) {
    if (!taken.has(cell) && map.isTraversable(cell)) {
      cells.push(cell);
    }
  }
  if (cells.length < citizens - 6) {
    throw new Error(`the map has room for ${cells.length + 6} citizens only`);
  }
  if (cells.length === 0) {
    return session;
  }
  const spawned = session.dispatch({
    kind: "DebugSpawn",
    prototypeId: "peasant",
    mapId: 1,
    cells,
    inventory: [{ materialId: "bread", quantity: 10 }],
  });
  if (!spawned.ok) {
    throw new Error(`could not spawn the citizens: ${spawned.error.message}`);
  }
  session.step(1);
  return session;
}

/**
 * Number of entities that have Needs (the citizens).
 *
 * @param session - The game.
 * @returns The count.
 */
export function citizenCount(session: GameSession): number {
  return session.engine.store
    .entities()
    .filter((entity) => entity.components["Needs"] !== undefined).length;
}

/**
 * Milliseconds per tick of a settlement with `citizens` settlers over `ticks` ticks.
 *
 * @param citizens - Number of citizens.
 * @param ticks - Ticks to play after the spawn tick.
 * @returns The mean and the slowest tick.
 */
export function measureSettlementTick(
  citizens: number,
  ticks: number,
): { meanMs: number; worstMs: number; citizens: number } {
  const session = createSettlement(citizens);
  let worst = 0;
  const started = nowMs();
  for (let tick = 0; tick < ticks; tick += 1) {
    const before = nowMs();
    session.step(1);
    worst = Math.max(worst, nowMs() - before);
  }
  return { meanMs: (nowMs() - started) / ticks, worstMs: worst, citizens: citizenCount(session) };
}

/**
 * Spec 007 SC-007 and 022: the query surface answers in under 5 ms with 1000+ entities.
 *
 * @param entities - How many entities to have in the game.
 * @returns Milliseconds per query name.
 */
export function measureQueries(entities: number): { [query: string]: number } {
  const session = createScenarioSession();
  session.newGame({ seed: 42, difficulty: "peaceful", mapSize: 2 });
  const map = session.engine.maps.require(1);
  const cells: number[] = [];
  const missing = entities - session.engine.store.entities().length;
  for (let cell = 0; cell < map.cellCount && cells.length < missing; cell += 1) {
    if (map.isTraversable(cell)) {
      cells.push(cell);
    }
  }
  if (cells.length < missing) {
    throw new Error(`the map has room for ${cells.length} more entities only`);
  }
  const spawned = session.dispatch({
    kind: "DebugSpawn",
    prototypeId: "loose_pile",
    mapId: 1,
    cells,
  });
  if (!spawned.ok) {
    throw new Error(`could not spawn: ${spawned.error.message}`);
  }
  session.step(1);
  const result: { [query: string]: number } = {};
  for (const name of ["state", "time", "settlement", "maps", "entities", "zones", "stock"]) {
    result[name] = medianMs(5, () => {
      const answer = session.query.run(name, {});
      if (!answer.ok) {
        throw new Error(`query ${name} failed: ${answer.error.message}`);
      }
    });
  }
  result["entity count"] = session.engine.store.entities().length;
  return result;
}
