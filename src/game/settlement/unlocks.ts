import { SettlementTier } from "../content/contentTypes";
import { unlockText } from "../construction/constructionDefinitions";
import type { GameEngine } from "../engine/GameEngine";
import { getSettlementService } from "./settlementServiceRegistry";
import { hasReachedTier } from "./tierOrder";
import { LockedContentKind } from "./settlementTypes";
import type { UnlockView } from "./settlementTypes";

type UnlockRecord = {
  id: string;
  name: string;
  unlockTier?: SettlementTier | undefined;
};

function recordsOf(engine: GameEngine, kind: LockedContentKind): readonly UnlockRecord[] {
  switch (kind) {
    case LockedContentKind.Furniture:
      return engine.content.furniture.all();
    case LockedContentKind.ZoneType:
      return engine.content.zones.all();
    case LockedContentKind.Recipe:
      return engine.content.recipes.all();
    case LockedContentKind.JobType:
      return engine.content.jobs.all();
    case LockedContentKind.DwellingLevel:
      return engine.content.dwellingLevels
        .all()
        .map((level) => ({ id: level.level, name: level.level, unlockTier: level.unlockTier }));
  }
}

/**
 * The unlock table (spec 027 FR-007): every piece of furniture, zone type, recipe, job type and
 * dwelling level with the tier that unlocks it (absent means Hamlet), whether the settlement has
 * reached it and the text `Unlocks at <Tier>` for locked entries. Locked content stays registered
 * and browsable (FR-008).
 *
 * @param engine - The engine.
 * @returns Rows by content kind (furniture, zone types, recipes, job types, dwelling levels) in
 *   file order.
 */
export function buildUnlockViews(engine: GameEngine): UnlockView[] {
  const tier = getSettlementService(engine).tier();
  return Object.values(LockedContentKind).flatMap((contentKind) =>
    recordsOf(engine, contentKind).map((record) => {
      const unlockTier = record.unlockTier ?? SettlementTier.Hamlet;
      const unlocked = hasReachedTier(tier, unlockTier);
      return {
        contentKind,
        contentId: record.id,
        name: record.name,
        unlockTier,
        unlocked,
        lockText: unlocked ? null : unlockText(unlockTier),
      };
    }),
  );
}

/**
 * Whether one piece of content is unlocked at the tier in force (spec 027 FR-009 `isUnlocked`).
 *
 * @param engine - The engine.
 * @param contentKind - The kind of content.
 * @param contentId - Its id.
 * @returns True when unlocked; false when locked or unknown.
 */
export function isUnlocked(
  engine: GameEngine,
  contentKind: LockedContentKind,
  contentId: string,
): boolean {
  return buildUnlockViews(engine).some(
    (row) => row.contentKind === contentKind && row.contentId === contentId && row.unlocked,
  );
}

/**
 * The content that a tier unlocks (spec 027 FR-009 `getUnlockedAt`): the entries whose
 * `unlockTier` is exactly that tier (Hamlet for entries without one).
 *
 * @param engine - The engine.
 * @param tier - A tier.
 * @returns The rows in table order.
 */
export function getUnlockedAt(engine: GameEngine, tier: SettlementTier): UnlockView[] {
  return buildUnlockViews(engine).filter((row) => row.unlockTier === tier);
}
