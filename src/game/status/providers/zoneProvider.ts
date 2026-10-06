import { getComponent } from "../../ecs/Entity";
import { zoneComponent } from "../../zones/zoneComponent";
import { getZoneService } from "../../zones/zoneServiceRegistry";
import { makeReason } from "../reasons";
import { fieldReasons } from "./fieldReasons";
import { BlockedReasonKind, StatusState, StatusSubjectKind } from "../statusTypes";
import type { StatusProvider, SubjectStatus } from "../statusTypes";

/**
 * The status provider of zones (spec 025 subject `Zone`): Active while the zone is active (an
 * active `farm_field` that waits for a farmer or has no fertile soil is Blocked with the reasons of
 * `fieldReasons`), otherwise Blocked with `ZoneRequirementsUnmet {gaps}` (the gaps of spec 015 FR-017, mapped
 * kind by kind: `not-enclosed`, `too-small`, `missing-furniture`, `missing-job-board`).
 */
export const zoneProvider: StatusProvider = {
  kind: StatusSubjectKind.Zone,
  subjects: (engine) =>
    getZoneService(engine)
      .zones()
      .filter((zone) => !engine.store.isPendingDelete(zone.id))
      .map((zone) => ({ kind: StatusSubjectKind.Zone, id: zone.id })),
  evaluate: (engine, ref): SubjectStatus | null => {
    const entity = engine.store.get(ref.id);
    const data = entity === undefined ? undefined : getComponent(entity, zoneComponent);
    if (data === undefined || engine.store.isPendingDelete(ref.id)) {
      return null;
    }
    if (data.active) {
      const reasons = fieldReasons(engine, ref.id);
      return reasons.length === 0
        ? { state: StatusState.Active, activity: null, reasons: [] }
        : { state: StatusState.Blocked, activity: null, reasons };
    }
    return {
      state: StatusState.Blocked,
      activity: null,
      reasons: [
        makeReason(BlockedReasonKind.ZoneRequirementsUnmet, {
          zoneTypeId: data.zoneTypeId,
          gaps: data.gaps.map((gap) => ({
            kind: gap.kind,
            requirement: gap.requirement,
            required: gap.required,
            present: gap.present,
          })),
        }),
      ],
    };
  },
};
