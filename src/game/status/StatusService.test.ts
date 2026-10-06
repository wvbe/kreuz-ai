import { describe, expect, it } from "vitest";
import { StatusService } from "./StatusService";
import { StatusSubjectKind } from "./statusTypes";
import type { StatusProvider } from "./statusTypes";

const provider = (kind: StatusSubjectKind): StatusProvider => ({
  kind,
  subjects: () => [],
  evaluate: () => null,
});

describe("StatusService", () => {
  it("keeps providers in registration order and finds them by kind", () => {
    const service = new StatusService();
    service.registerProvider(provider(StatusSubjectKind.Zone));
    service.registerProvider(provider(StatusSubjectKind.Citizen));
    expect(service.providers().map((entry) => entry.kind)).toEqual([
      StatusSubjectKind.Zone,
      StatusSubjectKind.Citizen,
    ]);
    expect(service.providerOf(StatusSubjectKind.Citizen)?.kind).toBe(StatusSubjectKind.Citizen);
    expect(service.providerOf(StatusSubjectKind.Dwelling)).toBeUndefined();
  });

  it("rejects a second provider of the same kind", () => {
    const service = new StatusService();
    service.registerProvider(provider(StatusSubjectKind.Zone));
    expect(() => service.registerProvider(provider(StatusSubjectKind.Zone))).toThrow(
      /already registered/,
    );
  });

  it("replaces a provider in place and registers one for a new kind", () => {
    const service = new StatusService();
    service.registerProvider(provider(StatusSubjectKind.Zone));
    service.registerProvider(provider(StatusSubjectKind.Citizen));
    const swapped = provider(StatusSubjectKind.Zone);
    service.replaceProvider(swapped);
    service.replaceProvider(provider(StatusSubjectKind.Dwelling));
    expect(service.providers().map((entry) => entry.kind)).toEqual([
      StatusSubjectKind.Zone,
      StatusSubjectKind.Citizen,
      StatusSubjectKind.Dwelling,
    ]);
    expect(service.providerOf(StatusSubjectKind.Zone)).toBe(swapped);
  });

  it("owns an empty tracker and ledger", () => {
    const service = new StatusService();
    expect(service.tracker.records()).toEqual([]);
    expect(service.ledger.dayList()).toEqual([]);
  });
});
