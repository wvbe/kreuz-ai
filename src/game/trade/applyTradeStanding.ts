import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { governmentFactionId } from "../factions/factionRegistry";
import { getStanding, setStanding } from "../factions/factionStanding";
import { toDay } from "../time/GameTime";
import { getTradeService } from "./tradeServiceRegistry";
import { traderComponent } from "./traderComponent";

/**
 * The standing hook of a completed trade (DECISIONS D-14, plan 4.1): a trade between the
 * settlement and a trader raises the standing of the trader's faction and of the settlement
 * toward each other by `tradeStandingPerTrade` (1), at most `tradeStandingDailyCap` (5) per day
 * and trader faction. Diplomacy proper (acts, thresholds, agreements) is task 4.2.
 *
 * @param engine - The engine.
 * @param trader - The trader entity of the trade.
 * @returns The standing points gained (0 when the cap is reached or a faction is missing).
 */
export function applyTradeStanding(engine: GameEngine, trader: Entity): number {
  const data = getComponent(trader, traderComponent);
  const government = governmentFactionId(engine);
  if (data === undefined || data.factionId === 0 || government === null) {
    return 0;
  }
  const constants = engine.content.constants;
  const service = getTradeService(engine);
  const day = toDay(engine.time.tickCount);
  const room = constants.tradeStandingDailyCap - service.gainedOn(day, data.factionId);
  const points = Math.min(constants.tradeStandingPerTrade, room);
  if (points < 1) {
    return 0;
  }
  setStanding(
    engine,
    data.factionId,
    government,
    getStanding(engine, data.factionId, government).value + points,
  );
  setStanding(
    engine,
    government,
    data.factionId,
    getStanding(engine, government, data.factionId).value + points,
  );
  service.addGain(day, data.factionId, points);
  return points;
}
