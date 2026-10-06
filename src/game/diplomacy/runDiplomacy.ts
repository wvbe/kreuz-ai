import type { GameEngine } from "../engine/GameEngine";
import { tickOfDay, toDay } from "../time/GameTime";
import { runEnvoys } from "./envoyTrips";
import { runNpcFactions } from "./npcAi";
import { expireProposals } from "./proposals";
import { decayStandings } from "./standingRules";
import { runSuccession } from "./runSuccession";

/**
 * Whether the standing decay of D-56 happens on a tick: at the first tick of every
 * `standingDecayIntervalDays`-th day (day 2, 4, ... with the default of 2), never on tick 0.
 *
 * @param engine - The engine (the interval is a content constant).
 * @param tick - The tick being processed.
 * @returns True on a decay tick.
 */
export function isDecayTick(engine: GameEngine, tick: number): boolean {
  return (
    tick > 0 &&
    tickOfDay(tick) === 0 &&
    toDay(tick) % engine.content.constants.standingDecayIntervalDays === 0
  );
}

/**
 * The diplomacy pass of pipeline slot 11, after the trader visits: leader succession (D-14), lapsed
 * proposals, envoys (delivery, timeout, return), the NPC faction AI and, once per interval, the
 * decay of every standing toward neutral.
 *
 * @param engine - The engine.
 * @param tick - The tick being processed.
 */
export function runDiplomacy(engine: GameEngine, tick: number): void {
  runSuccession(engine);
  expireProposals(engine, tick);
  runEnvoys(engine, tick);
  runNpcFactions(engine, tick);
  if (isDecayTick(engine, tick)) {
    decayStandings(engine);
  }
}
