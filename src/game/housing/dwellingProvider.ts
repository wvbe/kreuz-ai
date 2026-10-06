import { inputProducer } from "../production/productionBlockers";
import { findSources } from "../storage/storageQueries";
import { makeReason } from "../status/reasons";
import { fromProductionCause } from "../status/providers/productionReasons";
import { BlockedReasonKind, StatusState, StatusSubjectKind } from "../status/statusTypes";
import type { Reason, StatusProvider, SubjectStatus } from "../status/statusTypes";
import type { GameEngine } from "../engine/GameEngine";
import type { EntityId } from "../ecs/Entity";
import { createRequirementContext, levelRequirements, unmetNames } from "./dwellingRequirements";
import { dwellingOf, dwellingStorage, listDwellings } from "./dwellingZones";
import type { DwellingRecord } from "./dwellingZones";
import { levelDefinition, nextLevelOf } from "./dwellingLevels";
import { householdShortfalls } from "./householdDemand";
import { residentsOf } from "./household";
import { getHousingService } from "./housingServiceRegistry";
import { DwellingRequirementKind } from "./housingTypes";
import type { LevelRequirements } from "./housingTypes";
import { demandedGroups } from "./suppliedGoods";

function requirementsOf(
  engine: GameEngine,
  record: DwellingRecord,
  residents: number,
): { current: LevelRequirements; next: LevelRequirements | null } {
  const remembered = getHousingService(engine).recall(record.entity.id);
  if (remembered !== null) {
    return { current: remembered.value.current, next: remembered.value.next };
  }
  const context = createRequirementContext(engine, record, residents, null);
  const nextLevel = nextLevelOf(record.dwelling.level);
  return {
    current: levelRequirements(context, record.dwelling.level),
    next: nextLevel === null ? null : levelRequirements(context, nextLevel),
  };
}

function missingInputReasons(
  engine: GameEngine,
  record: DwellingRecord,
  residentIds: readonly EntityId[],
): { reason: Reason; current: boolean }[] {
  const resident = residentIds[0] === undefined ? undefined : engine.store.get(residentIds[0]);
  if (resident === undefined) {
    return [];
  }
  const currentSignatures = levelDefinition(engine, record.dwelling.level).suppliedGoods.map(
    (good) => good.materialIds.join("|"),
  );
  const reasons: { reason: Reason; current: boolean }[] = [];
  for (const entry of householdShortfalls(engine, record, residentIds.length)) {
    const reachable = entry.group.materialIds.some(
      (materialId) => findSources(engine, resident, materialId, entry.shortfall, false).length > 0,
    );
    if (reachable) {
      continue;
    }
    const materialId = entry.group.materialIds[0] ?? "";
    const producer = inputProducer(engine, materialId, 0);
    reasons.push({
      reason: makeReason(
        BlockedReasonKind.MissingInput,
        {
          materialId,
          required: entry.shortfall,
          available: 0,
          noProducer: producer.noProducer,
        },
        fromProductionCause(producer.causeRef),
      ),
      current: currentSignatures.includes(entry.group.signature),
    });
  }
  return reasons;
}

/**
 * The status provider of dwellings (spec 029 FR-019a, spec 025 subject `Dwelling`, DECISIONS D-18):
 * - an inactive dwelling is Blocked with `ZoneInactive {zoneId}` (its zone is the cause);
 * - an active dwelling without residents is Active (nothing to evaluate);
 * - otherwise the requirements of the current and the next level, as of today's evaluation (or
 *   derived now after a load): `DwellingRequirementsUnmet {targetLevel, unmet}` (the current level
 *   makes the dwelling Blocked, only the next level makes it Idle), `LockedByTier {requiredTier}`
 *   for a tier-locked next level, `NoHouseholdStorage` when a demanded good has no storage to go
 *   into, and `MissingInput {materialId, required, available, noProducer}` when the household is
 *   short of a good that no storage outside the household holds;
 * - Active when nothing is unmet (including the top level).
 */
export const dwellingProvider: StatusProvider = {
  kind: StatusSubjectKind.Dwelling,
  subjects: (engine) =>
    listDwellings(engine).map((record) => ({
      kind: StatusSubjectKind.Dwelling,
      id: record.entity.id,
    })),
  evaluate: (engine, ref): SubjectStatus | null => {
    const record = dwellingOf(engine, ref.id);
    if (record === null) {
      return null;
    }
    if (!record.zone.active) {
      return {
        state: StatusState.Blocked,
        activity: null,
        reasons: [
          makeReason(
            BlockedReasonKind.ZoneInactive,
            { zoneId: ref.id },
            { kind: StatusSubjectKind.Zone, id: ref.id },
          ),
        ],
      };
    }
    const residents = residentsOf(engine, ref.id);
    if (residents.length === 0) {
      return { state: StatusState.Active, activity: null, reasons: [] };
    }
    const { current, next } = requirementsOf(engine, record, residents.length);
    const reasons: Reason[] = [];
    let blocked = false;
    if (!current.met) {
      blocked = true;
      reasons.push(
        makeReason(BlockedReasonKind.DwellingRequirementsUnmet, {
          targetLevel: current.level,
          unmet: unmetNames(current),
        }),
      );
    }
    if (next !== null && !next.met) {
      const locked = next.requirements.find(
        (entry) => entry.kind === DwellingRequirementKind.TierUnlocked && !entry.met,
      );
      if (locked !== undefined) {
        reasons.push(
          makeReason(BlockedReasonKind.LockedByTier, {
            requiredTier: locked.requiredTier ?? "",
          }),
        );
      }
      const others: LevelRequirements = {
        level: next.level,
        met: false,
        requirements: next.requirements.filter((entry) => entry !== locked),
      };
      if (others.requirements.some((entry) => !entry.met)) {
        reasons.push(
          makeReason(BlockedReasonKind.DwellingRequirementsUnmet, {
            targetLevel: next.level,
            unmet: unmetNames(others),
          }),
        );
      }
    }
    const demanded = demandedGroups(engine, record.dwelling.level);
    if (demanded.length > 0 && dwellingStorage(engine, record.zone).length === 0) {
      reasons.push(makeReason(BlockedReasonKind.NoHouseholdStorage, { dwellingId: ref.id }));
    }
    for (const missing of missingInputReasons(
      engine,
      record,
      residents.map((entity) => entity.id),
    )) {
      blocked = blocked || missing.current;
      reasons.push(missing.reason);
    }
    if (reasons.length === 0) {
      return { state: StatusState.Active, activity: null, reasons: [] };
    }
    return { state: blocked ? StatusState.Blocked : StatusState.Idle, activity: null, reasons };
  },
};
