import { z } from "zod";
import type { JsonValue } from "../engine/EventBus";
import { SaveSectionLocation } from "../save/SaveSectionRegistry";
import type { SaveSection } from "../save/SaveSectionRegistry";
import type { PendingWage } from "./tradeTypes";

const idSchema = z.number().int().min(1);

const sectionSchema = z
  .object({
    payments: z.array(
      z
        .object({
          paymentId: idSchema,
          workerId: idSchema,
          amount: idSchema,
          createdTick: z.number().int().min(0),
        })
        .strict(),
    ),
    unavailableDay: z.number().int().min(-1),
  })
  .strict()
  .refine(
    (data) =>
      data.payments.every(
        (payment, index) =>
          index === 0 || (data.payments[index - 1]?.paymentId ?? 0) < payment.paymentId,
      ),
    { message: "payments must be unique and ascending by paymentId" },
  );

/**
 * Per-engine treasury state that is not on entities: the wages that wait for coins or for room in
 * the worker's inventory (DECISIONS D-12, saved in the section `systems.treasury`) and the day
 * `treasury.unavailable` was last reported.
 */
export class TreasuryService {
  private paymentList: PendingWage[] = [];
  private reportedDay = -1;

  /**
   * Queues a wage. A payment with the same id (the same claim) is not queued twice.
   *
   * @param payment - The wage.
   * @returns True when it was queued.
   */
  enqueue(payment: PendingWage): boolean {
    if (this.paymentList.some((queued) => queued.paymentId === payment.paymentId)) {
      return false;
    }
    this.paymentList.push({ ...payment });
    this.paymentList.sort((left, right) => left.paymentId - right.paymentId);
    return true;
  }

  /**
   * Removes a paid or dropped wage.
   *
   * @param paymentId - The payment id.
   */
  remove(paymentId: number): void {
    this.paymentList = this.paymentList.filter((payment) => payment.paymentId !== paymentId);
  }

  /**
   * The queued wages, ascending by payment id.
   *
   * @returns Copies.
   */
  payments(): PendingWage[] {
    return this.paymentList.map((payment) => ({ ...payment }));
  }

  /**
   * Marks the day on which `treasury.unavailable` was reported.
   *
   * @param day - Game day.
   * @returns True when the day is new, so the event should be emitted now.
   */
  markUnavailable(day: number): boolean {
    if (this.reportedDay === day) {
      return false;
    }
    this.reportedDay = day;
    return true;
  }

  /**
   * The save section `systems.treasury`: the queued wages and the unavailable marker.
   *
   * @returns The section for `registerSystem({ saveSection })`.
   */
  createSection(): SaveSection {
    return {
      key: "treasury",
      location: SaveSectionLocation.Systems,
      schema: sectionSchema,
      serialize: (): JsonValue => ({
        payments: this.paymentList.map((payment) => ({ ...payment })),
        unavailableDay: this.reportedDay,
      }),
      restore: (saved: JsonValue) => {
        const parsed = sectionSchema.parse(saved);
        this.paymentList = parsed.payments.map((payment) => ({ ...payment }));
        this.reportedDay = parsed.unavailableDay;
      },
      defaultForOlderSaves: () => ({ payments: [], unavailableDay: -1 }),
    };
  }
}
