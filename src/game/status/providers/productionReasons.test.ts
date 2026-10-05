import { describe, expect, it } from "vitest";
import { CauseSubjectKind, ProductionBlockedKind } from "../../production/productionTypes";
import { BlockedReasonKind, StatusSubjectKind } from "../statusTypes";
import { fromProductionCause, fromProductionReasons } from "./productionReasons";

describe("fromProductionCause", () => {
  it("maps zone and workstation causes and passes null through", () => {
    expect(fromProductionCause(null)).toBeNull();
    expect(fromProductionCause({ kind: CauseSubjectKind.Zone, entityId: 4 })).toEqual({
      kind: StatusSubjectKind.Zone,
      id: 4,
    });
    expect(fromProductionCause({ kind: CauseSubjectKind.Workstation, entityId: 9 })).toEqual({
      kind: StatusSubjectKind.Workstation,
      id: 9,
    });
  });
});

describe("fromProductionReasons", () => {
  it("keeps kind, params and order and maps the cause", () => {
    const reasons = fromProductionReasons([
      {
        kind: ProductionBlockedKind.MissingRoom,
        params: { zoneTypeId: "bakery" },
        causeRef: { kind: CauseSubjectKind.Zone, entityId: 4 },
      },
      { kind: ProductionBlockedKind.NoOrders, params: {}, causeRef: null },
    ]);
    expect(reasons).toEqual([
      {
        kind: BlockedReasonKind.MissingRoom,
        params: { zoneTypeId: "bakery" },
        causeRef: { kind: StatusSubjectKind.Zone, id: 4 },
      },
      { kind: BlockedReasonKind.NoOrders, params: {}, causeRef: null },
    ]);
  });
});
