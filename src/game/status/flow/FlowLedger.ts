import { z } from "zod";
import type { JsonValue } from "../../engine/EventBus";
import { SaveSectionLocation } from "../../save/SaveSectionRegistry";
import type { SaveSection } from "../../save/SaveSectionRegistry";
import { FlowDirection, FlowSource, ledgerWindowDays, StatusSubjectKind } from "../statusTypes";
import type { FlowDay, FlowEntry } from "../statusTypes";

const entrySchema = z
  .object({
    materialId: z.string().min(1),
    direction: z.nativeEnum(FlowDirection),
    source: z.nativeEnum(FlowSource),
    subject: z
      .object({ kind: z.nativeEnum(StatusSubjectKind), id: z.number().int().min(1) })
      .strict()
      .nullable(),
    quantity: z.number().int().min(1),
  })
  .strict();

const ledgerSectionSchema = z
  .object({
    days: z.array(
      z.object({ day: z.number().int().min(0), entries: z.array(entrySchema) }).strict(),
    ),
  })
  .strict();

function entryKey(entry: FlowEntry): string {
  return `${entry.materialId}|${entry.direction}|${entry.source}|${entry.subject === null ? "none" : `${entry.subject.kind}#${entry.subject.id}`}`;
}

function copyEntry(entry: FlowEntry): FlowEntry {
  return { ...entry, subject: entry.subject === null ? null : { ...entry.subject } };
}

function compareEntries(left: FlowEntry, right: FlowEntry): number {
  const leftKey = entryKey(left);
  const rightKey = entryKey(right);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

/**
 * The production ledger of spec 025 FR-011: per game day the units of every material produced or
 * consumed, keyed by direction, source and the subject behind it. Only the last
 * `ledgerWindowDays` complete days and the current day are kept. Hauling, transfers, wages and
 * payments are never recorded (FR-012). Saved in the root section `productionLedger`.
 */
export class FlowLedger {
  private readonly days = new Map<number, Map<string, FlowEntry>>();

  /**
   * Adds units to a day's count.
   *
   * @param day - Game day (`toDay(tick)`).
   * @param entry - Material, direction, source, subject and a quantity of at least 1.
   */
  record(day: number, entry: FlowEntry): void {
    if (entry.quantity < 1) {
      return;
    }
    let bucket = this.days.get(day);
    if (bucket === undefined) {
      bucket = new Map();
      this.days.set(day, bucket);
    }
    const key = entryKey(entry);
    const existing = bucket.get(key);
    if (existing === undefined) {
      bucket.set(key, copyEntry(entry));
    } else {
      existing.quantity += entry.quantity;
    }
  }

  /**
   * Drops the days older than the window (`ledgerWindowDays` complete days before `currentDay`).
   *
   * @param currentDay - The day being processed.
   * @returns How many days were dropped.
   */
  prune(currentDay: number): number {
    let dropped = 0;
    for (const day of [...this.days.keys()]) {
      if (day < currentDay - ledgerWindowDays) {
        this.days.delete(day);
        dropped += 1;
      }
    }
    return dropped;
  }

  /**
   * The kept days, ascending, each with its entries in canonical order.
   *
   * @returns Copies.
   */
  dayList(): FlowDay[] {
    return [...this.days.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([day, bucket]) => ({
        day,
        entries: [...bucket.values()].sort(compareEntries).map(copyEntry),
      }));
  }

  /**
   * The root save section `productionLedger`.
   *
   * @returns The section for `registerSystem({ saveSection })`.
   */
  createSection(): SaveSection {
    return {
      key: "productionLedger",
      location: SaveSectionLocation.Root,
      schema: ledgerSectionSchema,
      serialize: (): JsonValue => ({ days: this.dayList() }),
      restore: (saved: JsonValue) => {
        this.days.clear();
        for (const saveDay of ledgerSectionSchema.parse(saved).days) {
          for (const entry of saveDay.entries) {
            this.record(saveDay.day, entry);
          }
        }
      },
      defaultForOlderSaves: () => ({ days: [] }),
    };
  }
}
