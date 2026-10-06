import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { JsonValue } from "../../src/game/engine/EventBus";
import { createScenarioSession } from "../../src/game/api/scenario/createScenarioSession";
import type { GameSession } from "../../src/game/api/GameSession";
import { parseScenario } from "../../src/game/api/scenario/Scenario";
import { checkInvariants } from "./invariants";
import { InventoryLedger } from "./inventoryLedger";

// The soak run of plan task 7.1: a long deterministic game driven by the hamlet-to-village
// opening (player commands only) and then left alone, with the invariants of ./invariants and
// the item ledger checked every `checkEvery` ticks and save/load round trips at seeded random
// ticks. Used by tests/soak/soak.test.ts (short) and by `npm run soak` (10,000 ticks, 2 seeds).

/**
 * Settings of one soak run.
 */
export type SoakOptions = {
  /** The game seed. */
  seed: number;
  /** The difficulty of the game. */
  difficulty: string;
  /** Total ticks to play (the opening is cut off when it is longer). */
  ticks: number;
  /** Invariants are checked after this many ticks. */
  checkEvery: number;
  /** How many save/load round trips to do, at ticks drawn from `seed`. */
  roundTrips: number;
};

/**
 * What a soak run found.
 */
export type SoakReport = {
  seed: number;
  ticks: number;
  checkpoints: number;
  roundTrips: number;
  ledgerChecks: number;
  maxEntities: number;
  finalEntities: number;
  finalHash: string;
  /**
   * The final save with what only the number of save/load commands changes removed (timestamp,
   * command ids), so a run with round trips can be compared with a run without them.
   */
  comparableState: string;
  violations: string[];
};

type Step = { [key: string]: JsonValue };

/**
 * Small deterministic generator (mulberry32) for choosing the round-trip ticks; the soak
 * harness is outside `src/game`, so it needs no engine stream.
 *
 * @param seed - The seed.
 * @returns A function giving the next float in [0, 1).
 */
export function seededUnit(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Loads the commands and waits of the hamlet-to-village scenario (assertions and hash checks are
 * left out: the soak run checks invariants instead).
 *
 * @returns The steps that change the game.
 */
export function loadOpening(): Step[] {
  const text = readFileSync(
    join(__dirname, "..", "..", "scenarios", "hamlet-to-village.json"),
    "utf8",
  );
  const parsed = parseScenario(text);
  if (!parsed.ok) {
    throw new Error(parsed.issues.join("; "));
  }
  return parsed.scenario.steps.filter((step) => "command" in step || "step" in step);
}

function saveLoadRoundTrip(session: GameSession): string[] {
  const saved = session.save();
  if (!saved.ok) {
    return [`save failed: ${saved.error.message}`];
  }
  // Taken after the save command: every accepted command, save-game and load-game included,
  // consumes one command id and the counter is part of the hash (D-39).
  const before = session.stateHash();
  const loaded = session.load(saved.data as string);
  if (!loaded.ok) {
    return [`load failed: ${loaded.error.message}`];
  }
  const after = session.stateHash();
  return after === before ? [] : [`state hash ${before} became ${after} after save and load`];
}

/**
 * The state of a session without the bookkeeping of save and load commands.
 *
 * @param session - The game.
 * @returns A string that two games in the same state share.
 */
export function comparableState(session: GameSession): string {
  const saved = session.save();
  const root = JSON.parse(saved.ok ? (saved.data as string) : "{}") as {
    [key: string]: JsonValue;
  };
  delete root["timestamp"];
  const queue = (root["systems"] as { [key: string]: JsonValue })["commandQueue"] as {
    [key: string]: JsonValue;
  };
  delete queue["nextCommandId"];
  delete queue["pending"];
  return JSON.stringify(root);
}

/**
 * Plays one soak run.
 *
 * @param options - The settings.
 * @param onCheckpoint - Called with the tick after every checkpoint (progress output).
 * @returns The report; `violations` is empty when every invariant held.
 */
export function runSoak(options: SoakOptions, onCheckpoint?: (tick: number) => void): SoakReport {
  const session = createScenarioSession();
  session.newGame({ seed: options.seed, difficulty: options.difficulty, mapSize: 0 });
  const ledger = new InventoryLedger(session);
  const random = seededUnit(options.seed);
  const tripTicks = new Set<number>();
  for (let index = 0; index < options.roundTrips; index += 1) {
    const raw = Math.floor(random() * options.ticks);
    tripTicks.add(raw - (raw % options.checkEvery) + options.checkEvery);
  }
  const violations: string[] = [];
  let checkpoints = 0;
  let roundTrips = 0;
  let maxEntities = 0;

  const advance = (ticks: number): void => {
    let left = ticks;
    while (left > 0 && session.engine.time.tickCount < options.ticks) {
      const tick = session.engine.time.tickCount;
      const chunk = Math.min(
        left,
        options.checkEvery - (tick % options.checkEvery),
        options.ticks - tick,
      );
      const result = session.step(chunk);
      if (!result.ok) {
        violations.push(`step failed at tick ${tick}: ${result.error.message}`);
        return;
      }
      left -= chunk;
      const now = session.engine.time.tickCount;
      if (now % options.checkEvery === 0) {
        checkpoints += 1;
        for (const violation of [...checkInvariants(session), ...ledger.checkpoint()]) {
          violations.push(`tick ${now}: ${violation}`);
        }
        maxEntities = Math.max(maxEntities, session.engine.store.entities().length);
        if (tripTicks.has(now)) {
          roundTrips += 1;
          for (const violation of saveLoadRoundTrip(session)) {
            violations.push(`tick ${now}: ${violation}`);
          }
        }
        onCheckpoint?.(now);
      }
    }
  };

  for (const step of loadOpening()) {
    if ("command" in step) {
      const result = session.dispatch(step["command"] as { kind: string });
      if (!result.ok) {
        violations.push(`opening command failed: ${result.error.message}`);
      }
    } else {
      advance(step["step"] as number);
    }
  }
  advance(options.ticks - session.engine.time.tickCount);
  return {
    seed: options.seed,
    ticks: session.engine.time.tickCount,
    checkpoints,
    roundTrips,
    ledgerChecks: ledger.checked,
    maxEntities,
    finalEntities: session.engine.store.entities().length,
    finalHash: session.stateHash(),
    comparableState: comparableState(session),
    violations,
  };
}
