import { SettlementTier } from "../content/contentTypes";
import { getComponent } from "../ecs/Entity";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { identityComponent } from "../identity/identityComponent";
import { settlementProgressOf } from "../settlement/settlementProgressOf";
import { orderedTiers } from "../settlement/tierOrder";
import { toDay } from "../time/GameTime";
import { chronicleOf } from "./chronicleOf";
import { formatMoment } from "./formatMoment";
import type { MomentParams, MomentProminence, MomentRecord } from "./chronicleTypes";
import type { NotableMomentKind } from "../content/contentTypes";

/**
 * Plain view of a moment: the record plus the rendered text and the 1-based game day.
 */
export type MomentView = {
  readonly momentId: number;
  readonly tick: number;
  readonly day: number;
  readonly kind: NotableMomentKind;
  readonly prominence: MomentProminence;
  readonly entityId: EntityId | null;
  readonly nameSnapshot: string | null;
  readonly params: MomentParams;
  readonly text: string;
};

/**
 * View of the settlement chronicle (query `chronicle`).
 */
export type ChronicleView = {
  /**
   * Entries the filter matched, before the limit.
   */
  readonly total: number;
  /**
   * `chronicleCapacity`.
   */
  readonly capacity: number;
  readonly moments: readonly MomentView[];
};

/**
 * View of one citizen's journal (query `journal`).
 */
export type JournalView = {
  readonly entityId: EntityId;
  /**
   * `journalCapacity`.
   */
  readonly capacity: number;
  /**
   * Oldest first, as the journal is kept.
   */
  readonly entries: readonly MomentView[];
};

/**
 * Filter of the `chronicle` query: a citizen (works for deleted ones) and/or a moment kind.
 */
export type ChronicleFilter = {
  entityId?: EntityId;
  kind?: NotableMomentKind;
};

/**
 * The settlement tier in force at a tick: the highest tier reached at or before it (spec 028
 * FR-016: a moment of the hamlet days says "hamlet" for ever, even after the promotion).
 *
 * @param engine - The engine.
 * @param tick - A tick.
 * @returns The tier; Hamlet without a game.
 */
export function tierAtTick(engine: GameEngine, tick: number): SettlementTier {
  const reached = settlementProgressOf(engine)?.tierReachedAtTick ?? {};
  let tier = SettlementTier.Hamlet;
  for (const candidate of orderedTiers) {
    const reachedAt = reached[candidate];
    if (reachedAt !== undefined && reachedAt <= tick) {
      tier = candidate;
    }
  }
  return tier;
}

/**
 * Turns a record into its view: the template of its kind rendered with the record's name snapshot,
 * params and the tier in force at its tick (spec 028 FR-016).
 *
 * @param engine - The engine (content and the tier in force).
 * @param record - The moment.
 * @returns The view.
 */
export function toMomentView(engine: GameEngine, record: MomentRecord): MomentView {
  const tier = tierAtTick(engine, record.tick);
  return {
    momentId: record.momentId,
    tick: record.tick,
    day: toDay(record.tick) + 1,
    kind: record.kind,
    prominence: record.prominence,
    entityId: record.entityId,
    nameSnapshot: record.nameSnapshot,
    params: { ...record.params },
    text: formatMoment(engine.content, record, tier),
  };
}

/**
 * The chronicle for the query `chronicle`, newest first (spec 028 FR-018, FR-019, FR-024).
 *
 * @param engine - The engine.
 * @param filter - Optional citizen and kind filter.
 * @param limit - How many entries to return at most.
 * @returns The view; empty without a game.
 */
export function buildChronicleView(
  engine: GameEngine,
  filter: ChronicleFilter,
  limit: number,
): ChronicleView {
  const chronicle = chronicleOf(engine);
  const matching = (chronicle?.moments ?? [])
    .filter(
      (record) =>
        (filter.entityId === undefined || record.entityId === filter.entityId) &&
        (filter.kind === undefined || record.kind === filter.kind),
    )
    .reverse();
  return {
    total: matching.length,
    capacity: engine.content.constants.chronicleCapacity,
    moments: matching.slice(0, limit).map((record) => toMomentView(engine, record)),
  };
}

/**
 * The journal of a citizen for the query `journal` (spec 028 FR-019).
 *
 * @param engine - The engine.
 * @param entityId - The citizen.
 * @returns The view, or null when the entity does not exist or has no `Identity`.
 */
export function buildJournalView(engine: GameEngine, entityId: EntityId): JournalView | null {
  const entity = engine.store.get(entityId);
  const identity = entity === undefined ? undefined : getComponent(entity, identityComponent);
  return identity === undefined
    ? null
    : {
        entityId,
        capacity: engine.content.constants.journalCapacity,
        entries: identity.journal.map((record) => toMomentView(engine, record)),
      };
}

/**
 * Every moment still on record from a tick on, for the query `moments-since` (a renderer that
 * missed notifications catches up): the Major moments of the chronicle and the journal entries of
 * the living citizens, each once, ascending by moment id.
 *
 * @param engine - The engine.
 * @param tick - The first tick wanted.
 * @returns The moments.
 */
export function buildMomentsSince(engine: GameEngine, tick: number): MomentView[] {
  const byId = new Map<number, MomentRecord>();
  for (const record of chronicleOf(engine)?.moments ?? []) {
    byId.set(record.momentId, record);
  }
  for (const entity of engine.store.entities()) {
    for (const record of getComponent(entity, identityComponent)?.journal ?? []) {
      byId.set(record.momentId, record);
    }
  }
  return [...byId.values()]
    .filter((record) => record.tick >= tick)
    .sort((left, right) => left.momentId - right.momentId)
    .map((record) => toMomentView(engine, record));
}
