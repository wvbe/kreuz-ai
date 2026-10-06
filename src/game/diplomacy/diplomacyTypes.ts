import type { EntityId } from "../ecs/Entity";

/**
 * Id of the diplomacy system (envoys, proposals, NPC factions, succession, decay).
 */
export const diplomacySystemId = "diplomacy";

/**
 * Prototype id of an envoy entity (`Envoy` component and a cargo inventory).
 */
export const envoyPrototypeId = "diplomatic_envoy";

/**
 * Prototype id of the leader and heir of an NPC faction (a citizen without a position).
 */
export const npcLeaderPrototypeId = "npc_leader";

/**
 * Name of the PRNG stream of the NPC faction AI (DECISIONS section 0).
 */
export const diplomacyAiStreamName = "diplomacy.ai";

/**
 * Name of the PRNG stream that resolves envoy trips (travel jitter, DECISIONS D-56).
 */
export const diplomacyResolveStreamName = "diplomacy.resolve";

/**
 * Members each NPC faction starts with: a leader and one heir (D-56).
 */
export const npcStartingMembers = 2;

/**
 * The four acts an envoy can carry (spec 021 FR-009).
 */
export enum DiplomaticActType {
  Gift = "gift",
  TradeAgreement = "trade-agreement",
  Declaration = "declaration",
  Overture = "overture",
}

/**
 * Subtype of a declaration (spec 021 FR-009).
 */
export enum DeclarationKind {
  War = "war",
  Peace = "peace",
  Neutrality = "neutrality",
}

/**
 * Where an envoy is on its trip (spec 021 `DiplomaticEnvoy.status`).
 */
export enum EnvoyStatus {
  Traveling = "traveling",
  Delivered = "delivered",
  Returning = "returning",
}

/**
 * Why a dispatch failed (spec 021 `DispatchFailureReason`). `EnvoyDestroyed` only happens when the
 * envoy entity is deleted by something else: nothing in the game kills envoys (envoy combat is
 * descoped, D-14).
 */
export enum DispatchFailureReason {
  LeaderUnavailable = "leader-unavailable",
  Unreachable = "unreachable",
  EnvoyDestroyed = "envoy-destroyed",
}

/**
 * How the player answers an incoming proposal (D-14).
 */
export enum ProposalResponse {
  Accept = "accept",
  Counter = "counter",
  Reject = "reject",
}

/**
 * Kinds of NPC-driven incident that move standing without an envoy (D-56). Only an insult exists:
 * there is no combat or raiding.
 */
export enum IncidentKind {
  Insult = "insult",
}

/**
 * One stack carried by an envoy as a gift.
 */
export type CargoItem = {
  materialId: string;
  quantity: number;
};

/**
 * A proposal an NPC faction made to the player's faction: an overture or a trade agreement that
 * waits for `RespondToProposal` (spec 021 FR-013).
 */
export type Proposal = {
  proposalId: number;
  fromFactionId: EntityId;
  actType: DiplomaticActType;
  createdTick: number;
  expiryTick: number;
};

/**
 * When an NPC faction last started an act, for the cooldown of D-14.
 */
export type NpcActRecord = {
  factionId: EntityId;
  lastActTick: number;
};

/**
 * Event: an act was ordered (command or NPC AI).
 */
export const actInitiatedEvent = "diplomacy.act.initiated";

/**
 * Event: an envoy set out.
 */
export const dispatchStartedEvent = "diplomacy.dispatch.started";

/**
 * Event: an envoy reached the leader of the target faction.
 */
export const messageDeliveredEvent = "diplomacy.message.delivered";

/**
 * Event: a dispatch failed (leader unavailable, timeout, envoy deleted).
 */
export const dispatchFailedEvent = "diplomacy.dispatch.failed";

/**
 * Event: the target took an act (accepted or not).
 */
export const actResolvedEvent = "diplomacy.act.resolved";

/**
 * Event: a trade agreement was formed.
 */
export const agreementFormedEvent = "diplomacy.agreement.formed";

/**
 * Event: a trade agreement was cancelled.
 */
export const agreementCancelledEvent = "diplomacy.agreement.cancelled";

/**
 * Event: an NPC faction made the player a proposal.
 */
export const proposalReceivedEvent = "diplomacy.proposal.received";

/**
 * Event: the player answered a proposal.
 */
export const proposalRespondedEvent = "diplomacy.proposal.responded";

/**
 * Event: a proposal was not answered in time.
 */
export const proposalExpiredEvent = "diplomacy.proposal.expired";

/**
 * Event: an `IssueDiplomaticAct` was refused (the command itself only reports `command-failed`).
 */
export const actRefusedEvent = "diplomacy.act.refused";

/**
 * Event: the player cancelled a directive in flight.
 */
export const directiveCancelledEvent = "diplomacy.directive.cancelled";

/**
 * Event: an NPC faction insulted the settlement.
 */
export const incidentEvent = "diplomacy.incident";

/**
 * Payload of `diplomacy.act.initiated`.
 */
export type ActInitiated = {
  senderFactionId: EntityId;
  targetFactionId: EntityId;
  actType: string;
};

/**
 * Payload of `diplomacy.dispatch.started`.
 */
export type DispatchStarted = {
  envoyId: EntityId;
  senderFactionId: EntityId;
  targetFactionId: EntityId;
  actType: string;
};

/**
 * Payload of `diplomacy.message.delivered`.
 */
export type MessageDelivered = DispatchStarted;

/**
 * Payload of `diplomacy.dispatch.failed`.
 */
export type DispatchFailed = {
  envoyId: EntityId;
  senderFactionId: EntityId;
  targetFactionId: EntityId;
  reason: string;
};

/**
 * Payload of `diplomacy.act.resolved`: how the target took an act.
 */
export type ActResolved = {
  envoyId: EntityId;
  senderFactionId: EntityId;
  targetFactionId: EntityId;
  actType: string;
  accepted: boolean;
};

/**
 * Payload of `diplomacy.agreement.formed` and `.cancelled`.
 */
export type AgreementChanged = {
  factionAId: EntityId;
  factionBId: EntityId;
};

/**
 * Payload of `diplomacy.proposal.received`.
 */
export type ProposalReceived = {
  proposalId: number;
  fromFactionId: EntityId;
  actType: string;
  payload: { [name: string]: string | number };
};

/**
 * Payload of `diplomacy.proposal.responded` and `.expired`.
 */
export type ProposalClosed = {
  proposalId: number;
  fromFactionId: EntityId;
  actType: string;
  response: string;
};

/**
 * Payload of `diplomacy.act.refused`: `kind` is the `DiplomacyErrorKind`.
 */
export type ActRefused = {
  actType: string;
  targetFactionId: EntityId;
  kind: string;
  message: string;
};

/**
 * Payload of `diplomacy.directive.cancelled`.
 */
export type DirectiveCancelled = {
  envoyId: EntityId;
  senderFactionId: EntityId;
  targetFactionId: EntityId;
  actType: string;
};

/**
 * Payload of `diplomacy.incident`.
 */
export type IncidentHappened = {
  factionId: EntityId;
  targetFactionId: EntityId;
  kind: string;
  delta: number;
};

/**
 * Data of the `Envoy` component (spec 021 `DiplomaticEnvoy` and `DiplomaticMessage`): who sends
 * what to whom, the cargo of a gift, and the trip. An envoy that has not `Delivered` is a pending
 * directive.
 */
export type EnvoyData = {
  senderFactionId: EntityId;
  targetFactionId: EntityId;
  actType: DiplomaticActType;
  /**
   * Subtype of a declaration, else null.
   */
  declaration: DeclarationKind | null;
  /**
   * What a gift carries (also what the envoy's inventory holds until delivery or refund).
   */
  cargo: CargoItem[];
  /**
   * Value of the cargo in whole coins (coins count face value, goods `valueMilli`).
   */
  giftValueCoins: number;
  creationTick: number;
  /**
   * Ticks one way takes, from the seats' distance (plus the jitter of `diplomacy.resolve`).
   */
  travelTicks: number;
  /**
   * First tick the message can be delivered.
   */
  arriveTick: number;
  /**
   * Tick when an undelivered trip times out (`envoyStuckTimeoutTicks` after the dispatch).
   */
  deadlineTick: number;
  status: EnvoyStatus;
  /**
   * Tick the envoy is home and removed; null while traveling.
   */
  returnTick: number | null;
  /**
   * Why the trip failed, null for a trip that delivered or is under way.
   */
  failure: DispatchFailureReason | null;
};
