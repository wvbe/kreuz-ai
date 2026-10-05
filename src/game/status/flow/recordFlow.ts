import type { GameEngine } from "../../engine/GameEngine";
import { toDay } from "../../time/GameTime";
import { getStatusService } from "../statusServiceRegistry";
import type { FlowEntry } from "../statusTypes";

/**
 * Counts units of a material in the flow ledger on the current game day (the day of the tick
 * being processed, spec 025 FR-012). Systems whose events the ledger already listens to need not
 * call it; the trade task (4.1) calls it for sales and purchases of the player settlement
 * (`FlowSource.Trade`). Never record hauling, transfers, wages or treasury payments.
 *
 * @param engine - The engine.
 * @param entry - What was produced or consumed; amounts below 1 are ignored.
 */
export function recordFlow(engine: GameEngine, entry: FlowEntry): void {
  getStatusService(engine).ledger.record(toDay(engine.time.tickCount), entry);
}
