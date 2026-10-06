import type { GameEngine } from "../engine/GameEngine";
import { toDay } from "../time/GameTime";
import { admitSettlers } from "./admitSettlers";
import { clearInvalidHomes } from "./clearInvalidHomes";
import { collectRent } from "./collectRent";
import { foodsInWindow } from "./dwellingRequirements";
import { listDwellings } from "./dwellingZones";
import { enforceCapacity } from "./enforceCapacity";
import { ensureDwellings } from "./ensureDwellings";
import { evaluateDwelling } from "./evaluateDwelling";
import { freeDwellings, houseHomeless } from "./houseHomeless";
import { homelessCitizens, residentsByDwelling } from "./household";
import { getHousingService } from "./housingServiceRegistry";
import { runSupplyStep } from "./suppliedGoods";
import type { SupplyResult } from "./suppliedGoods";

/**
 * The daily housing evaluation (spec 029 FR-006, slot 13 at `housingEvaluationTickOfDay`).
 * Dwellings are processed in ascending zone entity id order; the order within one evaluation is
 * fixed:
 * 1. clear invalid homes (`clearInvalidHomes`);
 * 2. consume supplied goods (`runSupplyStep`, active dwellings with residents only) and prune each
 *    food record to the variety window;
 * 3. evaluate requirements, advance streaks, change levels (`evaluateDwelling`, active dwellings
 *    with residents only; the others keep their streaks);
 * 4. evict residents beyond capacity (`enforceCapacity`);
 * 5. collect rent (`collectRent`);
 * 6. house the homeless (`houseHomeless`);
 * 7. admit settlers (`admitSettlers`).
 *
 * @param engine - The engine.
 * @param tick - The tick being processed.
 */
export function runHousingEvaluation(engine: GameEngine, tick: number): void {
  const service = getHousingService(engine);
  const day = toDay(tick);
  ensureDwellings(engine);
  clearInvalidHomes(engine);
  let residents = residentsByDwelling(engine);
  const supplies = new Map<number, SupplyResult[]>();
  for (const record of listDwellings(engine)) {
    const here = residents.get(record.entity.id)?.length ?? 0;
    const window = engine.content.constants.foodVarietyWindowDays;
    const recent = new Set(foodsInWindow(record.dwelling.foodRecord, day, window));
    for (const materialId of Object.keys(record.dwelling.foodRecord)) {
      if (!recent.has(materialId)) {
        delete record.dwelling.foodRecord[materialId];
      }
    }
    record.dwelling.lastEvaluatedDay = day;
    if (record.zone.active && here > 0) {
      supplies.set(record.entity.id, runSupplyStep(engine, record, here));
    }
  }
  for (const record of listDwellings(engine)) {
    const supply = supplies.get(record.entity.id);
    if (supply !== undefined) {
      service.remember(
        record.entity.id,
        tick,
        evaluateDwelling(engine, record, residents.get(record.entity.id)?.length ?? 0, supply),
      );
    }
  }
  for (const record of listDwellings(engine)) {
    enforceCapacity(engine, record, residents.get(record.entity.id) ?? []);
  }
  residents = residentsByDwelling(engine);
  for (const record of listDwellings(engine)) {
    collectRent(engine, record, residents.get(record.entity.id) ?? []);
  }
  const free = freeDwellings(engine, listDwellings(engine), residents);
  houseHomeless(engine, free, homelessCitizens(engine), tick);
  admitSettlers(engine, free, tick);
}
