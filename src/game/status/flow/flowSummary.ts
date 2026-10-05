import { floorDiv } from "../../engine/fixedPoint";
import type { GameEngine } from "../../engine/GameEngine";
import { stockOf } from "../../storage/storageQueries";
import { toDay } from "../../time/GameTime";
import { refKey } from "../reasons";
import { getStatusService } from "../statusServiceRegistry";
import { FlowDirection, ledgerWindowDays } from "../statusTypes";
import type { FlowDay, FlowEntry, FlowParty, FlowRow } from "../statusTypes";

function partiesOf(entries: readonly FlowEntry[]): FlowParty[] {
  const byKey = new Map<string, FlowParty>();
  for (const entry of entries) {
    const key = `${entry.source}|${entry.subject === null ? "none" : refKey(entry.subject)}`;
    const existing = byKey.get(key);
    if (existing === undefined) {
      byKey.set(key, {
        subject: entry.subject === null ? null : { ...entry.subject },
        source: entry.source,
        quantity: entry.quantity,
      });
    } else {
      existing.quantity += entry.quantity;
    }
  }
  return [...byKey.entries()]
    .sort((left, right) => right[1].quantity - left[1].quantity || (left[0] < right[0] ? -1 : 1))
    .map(([, party]) => party);
}

function sum(entries: readonly FlowEntry[], direction: FlowDirection): number {
  return entries
    .filter((entry) => entry.direction === direction)
    .reduce((total, entry) => total + entry.quantity, 0);
}

function rowOf(
  engine: GameEngine,
  materialId: string,
  days: readonly FlowDay[],
  currentDay: number,
): FlowRow {
  const firstDay = Math.max(0, currentDay - ledgerWindowDays);
  const completeDays = currentDay - firstDay;
  const averaged = completeDays > 0 ? completeDays : 1;
  const averagedFirst = completeDays > 0 ? firstDay : currentDay;
  const mine = days.map((day) => ({
    day: day.day,
    entries: day.entries.filter((entry) => entry.materialId === materialId),
  }));
  const inAverage = mine.filter(
    (day) => day.day >= averagedFirst && day.day <= currentDay - (completeDays > 0 ? 1 : 0),
  );
  const produced = inAverage.reduce(
    (total, day) => total + sum(day.entries, FlowDirection.Produced),
    0,
  );
  const consumed = inAverage.reduce(
    (total, day) => total + sum(day.entries, FlowDirection.Consumed),
    0,
  );
  const trend: number[] = [];
  for (let day = firstDay; day <= currentDay; day += 1) {
    const entries = mine.find((candidate) => candidate.day === day)?.entries ?? [];
    trend.push(sum(entries, FlowDirection.Produced) - sum(entries, FlowDirection.Consumed));
  }
  const all = mine.flatMap((day) => day.entries);
  const netPerDayMilli = floorDiv((produced - consumed) * 1000, averaged);
  const stock = engine.materials.has(materialId) ? stockOf(engine, materialId).total : 0;
  return {
    materialId,
    producedPerDayMilli: floorDiv(produced * 1000, averaged),
    consumedPerDayMilli: floorDiv(consumed * 1000, averaged),
    netPerDayMilli,
    stock,
    daysOfSupplyMilli: netPerDayMilli < 0 ? floorDiv(stock * 1_000_000, -netPerDayMilli) : null,
    trend,
    windowProduced: sum(all, FlowDirection.Produced),
    windowConsumed: sum(all, FlowDirection.Consumed),
    producers: partiesOf(all.filter((entry) => entry.direction === FlowDirection.Produced)),
    consumers: partiesOf(all.filter((entry) => entry.direction === FlowDirection.Consumed)),
  };
}

/**
 * The Flow view (spec 025 FR-018, query `flow`): one row per material with ledger counts in the
 * window, largest deficit first (net per day ascending, then material id). Averages are over the
 * complete days of the window, or over the current day while none is complete yet.
 *
 * @param engine - The engine.
 * @returns The rows.
 */
export function buildFlowRows(engine: GameEngine): FlowRow[] {
  const days = getStatusService(engine).ledger.dayList();
  const currentDay = toDay(engine.time.tickCount);
  const materials = new Set<string>();
  for (const day of days) {
    for (const entry of day.entries) {
      materials.add(entry.materialId);
    }
  }
  return [...materials]
    .map((materialId) => rowOf(engine, materialId, days, currentDay))
    .sort(
      (left, right) =>
        left.netPerDayMilli - right.netPerDayMilli ||
        (left.materialId < right.materialId ? -1 : left.materialId > right.materialId ? 1 : 0),
    );
}

/**
 * The flow of one material (query `flow-of`): its row, or null when the ledger has nothing for it
 * in the window.
 *
 * @param engine - The engine.
 * @param materialId - Material id.
 * @returns The row, or null.
 */
export function buildFlowRow(engine: GameEngine, materialId: string): FlowRow | null {
  return buildFlowRows(engine).find((row) => row.materialId === materialId) ?? null;
}
