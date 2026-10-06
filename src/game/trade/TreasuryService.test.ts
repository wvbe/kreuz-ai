import { describe, expect, it } from "vitest";
import { TreasuryService } from "./TreasuryService";

const wage = (paymentId: number, amount = 2) => ({
  paymentId,
  workerId: 5,
  amount,
  createdTick: 10,
});

// @covers 019:FR-014 019:SC-006
describe("TreasuryService", () => {
  it("queues wages in payment order and ignores a repeated payment id", () => {
    const service = new TreasuryService();
    expect(service.enqueue(wage(9))).toBe(true);
    expect(service.enqueue(wage(3))).toBe(true);
    expect(service.enqueue(wage(9, 99))).toBe(false);
    expect(service.payments().map((payment) => payment.paymentId)).toEqual([3, 9]);
    expect(service.payments()[1]?.amount).toBe(2);
  });

  it("removes a wage and hands out copies", () => {
    const service = new TreasuryService();
    service.enqueue(wage(1));
    service.payments()[0]!.amount = 50;
    expect(service.payments()[0]?.amount).toBe(2);
    service.remove(1);
    expect(service.payments()).toEqual([]);
  });

  it("reports the missing treasury once per day", () => {
    const service = new TreasuryService();
    expect(service.markUnavailable(4)).toBe(true);
    expect(service.markUnavailable(4)).toBe(false);
    expect(service.markUnavailable(5)).toBe(true);
  });

  it("round-trips its section and rejects unordered payments", () => {
    const service = new TreasuryService();
    service.enqueue(wage(3));
    service.enqueue(wage(8, 4));
    service.markUnavailable(2);
    const section = service.createSection();
    expect(section.key).toBe("treasury");
    const saved = JSON.parse(JSON.stringify(section.serialize()));
    const other = new TreasuryService();
    other.createSection().restore(saved);
    expect(other.payments()).toEqual(service.payments());
    expect(other.markUnavailable(2)).toBe(false);
    expect(() =>
      other.createSection().restore({
        payments: [wage(8), wage(3)],
        unavailableDay: -1,
      }),
    ).toThrow();
    expect(section.defaultForOlderSaves?.()).toEqual({ payments: [], unavailableDay: -1 });
  });
});
