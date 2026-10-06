import type { JsonValue } from "../../../game/engine/EventBus";

/**
 * A pointer to something that has a status (`Citizen`, `Zone`, `ProductionOrder`, ...); the `id`
 * is an entity id except for postings and orders.
 */
export type StatusSubject = { kind: string; id: number };

/**
 * One structured reason of the `explain` query (kind, params, the subject that explains it).
 */
export type StatusReason = {
  kind: string;
  params: { [name: string]: JsonValue };
  causeRef: StatusSubject | null;
};

/**
 * What an Active subject is doing.
 */
export type StatusActivity = { kind: string; params: { [name: string]: JsonValue } };

/**
 * One step of the cause chain.
 */
export type StatusChainLink = {
  subject: StatusSubject;
  state: string;
  activity: StatusActivity | null;
  reason: StatusReason | null;
};

/**
 * The `explain` query as the panels read it (string kinds; the game's enums are not imported).
 */
export type StatusExplanation = {
  subject: StatusSubject;
  state: string;
  activity: StatusActivity | null;
  reasons: StatusReason[];
  chain: StatusChainLink[];
  /**
   * `Complete`, `Cycle`, `DepthCap` or `Gone`.
   */
  end: string;
};
