import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { credit, debit, getBalance } from "../inventory/inventoryMoney";
import { receiveRent } from "../trade/treasury";
import { levelDefinition } from "./dwellingLevels";
import type { DwellingRecord } from "./dwellingZones";
import { RentShortfallReason, rentCollectedEvent, rentUnpaidEvent } from "./housingTypes";

/**
 * How much each resident pays toward a rent: one coin per resident per round, residents in
 * ascending id order, round-robin until the rent is paid or nobody has coins left (spec 029
 * FR-013).
 *
 * @param balances - Coins per resident, in ascending resident id order.
 * @param rent - Coins due.
 * @returns Coins taken from each resident, same order and length as `balances`.
 */
export function splitRent(balances: readonly number[], rent: number): number[] {
  const paid = balances.map(() => 0);
  let remaining = rent;
  let progressed = true;
  while (remaining > 0 && progressed) {
    progressed = false;
    for (let index = 0; index < balances.length && remaining > 0; index += 1) {
      if ((paid[index] ?? 0) < (balances[index] ?? 0)) {
        paid[index] = (paid[index] ?? 0) + 1;
        remaining -= 1;
        progressed = true;
      }
    }
  }
  return paid;
}

/**
 * Step 5 of the daily evaluation (spec 029 FR-013): an active dwelling with residents pays its
 * level's `rentPerDay` from the residents' coins into the treasury. The coins leave the residents
 * with `debit` and enter the treasury through the trade system's rent hook (`receiveRent`), so
 * coins are neither created nor destroyed. When the treasury cannot take them the residents get
 * them back and `housing.rent.unpaid {reason: TreasuryUnavailable}` is queued; a short payment
 * queues `housing.rent.collected` for what arrived and `housing.rent.unpaid {reason:
 * InsufficientFunds}` for the shortfall, which is not carried forward. A level with rent 0 charges
 * nothing and says nothing.
 *
 * @param engine - The engine.
 * @param record - The dwelling.
 * @param residents - Its residents, ascending by id.
 * @returns The coins that reached the treasury.
 */
export function collectRent(
  engine: GameEngine,
  record: DwellingRecord,
  residents: readonly Entity[],
): number {
  const rent = levelDefinition(engine, record.dwelling.level).rentPerDay;
  if (!record.zone.active || residents.length === 0 || rent < 1) {
    return 0;
  }
  const context = { materials: engine.materials, actor: null, bus: engine.bus };
  const balances = residents.map((resident) => getBalance(context, resident));
  const paid = splitRent(balances, rent);
  const total = paid.reduce((sum, coins) => sum + coins, 0);
  const dwellingId = record.entity.id;
  if (total < 1) {
    engine.bus.emit(rentUnpaidEvent, {
      dwellingId,
      shortfall: rent,
      reason: RentShortfallReason.InsufficientFunds,
    });
    return 0;
  }
  residents.forEach((resident, index) => {
    if ((paid[index] ?? 0) > 0) {
      debit(context, resident, paid[index] as number);
    }
  });
  if (!receiveRent(engine, dwellingId, total)) {
    residents.forEach((resident, index) => {
      if ((paid[index] ?? 0) > 0) {
        credit(context, resident, paid[index] as number);
      }
    });
    engine.bus.emit(rentUnpaidEvent, {
      dwellingId,
      shortfall: rent,
      reason: RentShortfallReason.TreasuryUnavailable,
    });
    return 0;
  }
  engine.bus.emit(rentCollectedEvent, { dwellingId, amount: total });
  if (total < rent) {
    engine.bus.emit(rentUnpaidEvent, {
      dwellingId,
      shortfall: rent - total,
      reason: RentShortfallReason.InsufficientFunds,
    });
  }
  return total;
}
