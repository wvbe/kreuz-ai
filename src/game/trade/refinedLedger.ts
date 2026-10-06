import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { floorDiv } from "../engine/fixedPoint";
import { governmentFactionId } from "../factions/factionRegistry";
import { storeUpTo } from "../inventory/inventoryOperations";
import { getTotal } from "../inventory/inventoryQueries";
import { creditChangedEvent, milliPerItem } from "./tradeTypes";
import type { CreditChanged, Item, LedgerEntry } from "./tradeTypes";
import { getTradeService } from "./tradeServiceRegistry";
import { traderComponent } from "./traderComponent";

function settlementOf(engine: GameEngine): number | null {
  return governmentFactionId(engine);
}

/**
 * Whether a trader sells a material only through the ledger: some refine rule of its content
 * names it as the refined good (D-13).
 *
 * @param trader - The trader entity.
 * @param materialId - The material.
 * @returns True for a refined good of the trader.
 */
export function isRefinedGood(trader: Entity, materialId: string): boolean {
  const data = getComponent(trader, traderComponent);
  return data !== undefined && data.refines.some((rule) => rule.refinedMaterialId === materialId);
}

/**
 * The refined credit of the settlement with the kind of trader (D-13), in milli-items.
 *
 * @param engine - The engine.
 * @param traderPrototypeId - The trader's prototype id.
 * @param refinedMaterialId - The refined good.
 * @returns Milli-items of credit, 0 when none.
 */
export function refinedCreditMilli(
  engine: GameEngine,
  traderPrototypeId: string,
  refinedMaterialId: string,
): number {
  const settlement = settlementOf(engine);
  return settlement === null
    ? 0
    : getTradeService(engine).creditOf(traderPrototypeId, settlement, refinedMaterialId);
}

/**
 * Whole units of a refined good the trader may still sell: `floor(credit / 1000)`.
 *
 * @param engine - The engine.
 * @param trader - The trader entity.
 * @param materialId - The material.
 * @returns The allowance, or null when the trader sells the material freely (no refine rule).
 */
export function refinedAllowance(
  engine: GameEngine,
  trader: Entity,
  materialId: string,
): number | null {
  return isRefinedGood(trader, materialId)
    ? floorDiv(refinedCreditMilli(engine, trader.prototype, materialId), milliPerItem)
    : null;
}

function changeCredit(
  engine: GameEngine,
  traderPrototypeId: string,
  refinedMaterialId: string,
  deltaMilli: number,
): void {
  const settlement = settlementOf(engine);
  if (settlement === null || deltaMilli === 0) {
    return;
  }
  const service = getTradeService(engine);
  const next = Math.max(
    0,
    service.creditOf(traderPrototypeId, settlement, refinedMaterialId) + deltaMilli,
  );
  const entry: LedgerEntry = {
    traderPrototypeId,
    settlementFactionId: settlement,
    refinedMaterialId,
    creditMilli: next,
  };
  service.setCredit(entry);
  const payload: CreditChanged = {
    traderPrototypeId,
    settlementFactionId: settlement,
    refinedMaterialId,
    creditMilli: next,
  };
  engine.bus.emit(creditChangedEvent, payload);
}

/**
 * Adds credit for raw goods a trader just bought from the settlement (D-13): for each refine rule
 * whose raw material was sold, `credit[refined] += quantity * ratioMilli` milli-items. The credit
 * is persisted per settlement and trader kind and never expires.
 *
 * @param engine - The engine.
 * @param trader - The buying trader.
 * @param sold - The goods the trader bought.
 */
export function grantRefinedCredit(
  engine: GameEngine,
  trader: Entity,
  sold: readonly Item[],
): void {
  const data = getComponent(trader, traderComponent);
  if (data === undefined) {
    return;
  }
  for (const rule of data.refines) {
    const quantity = sold
      .filter((item) => item.materialId === rule.rawMaterialId)
      .reduce((sum, item) => sum + item.quantity, 0);
    if (quantity > 0) {
      changeCredit(engine, trader.prototype, rule.refinedMaterialId, quantity * rule.ratioMilli);
    }
  }
}

/**
 * Draws credit down after the settlement bought a refined good: `quantity * 1000` milli-items.
 *
 * @param engine - The engine.
 * @param trader - The selling trader.
 * @param materialId - The refined good bought.
 * @param quantity - Whole units bought.
 */
export function drawRefinedCredit(
  engine: GameEngine,
  trader: Entity,
  materialId: string,
  quantity: number,
): void {
  if (isRefinedGood(trader, materialId)) {
    changeCredit(engine, trader.prototype, materialId, -quantity * milliPerItem);
  }
}

/**
 * Tops the trader's stash of each refined good up to `floor(credit / 1000)` (D-13 invariant),
 * as far as its inventory takes it; the credit itself is never reduced by a full stash. Refined
 * goods exist only through this ledger, so a returning caravan finds its stashed stock again.
 *
 * @param engine - The engine.
 * @param trader - The trader entity.
 */
export function topUpRefinedStash(engine: GameEngine, trader: Entity): void {
  const data = getComponent(trader, traderComponent);
  if (data === undefined) {
    return;
  }
  for (const rule of data.refines) {
    const wanted = floorDiv(
      refinedCreditMilli(engine, trader.prototype, rule.refinedMaterialId),
      milliPerItem,
    );
    const missing = wanted - getTotal(trader, rule.refinedMaterialId);
    if (missing > 0) {
      storeUpTo(
        { materials: engine.materials, actor: null },
        trader,
        rule.refinedMaterialId,
        missing,
      );
    }
  }
}
