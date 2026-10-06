import { townCrierComponent } from "../crier/townCrierComponent";
import { getComponent } from "../ecs/Entity";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { citizenComponent } from "../factions/citizenComponent";
import { isMember } from "../factions/factionMembership";
import { governmentFactionId } from "../factions/factionRegistry";
import { getBoard } from "../jobs/jobBoards";
import { JobBoardMode } from "../jobs/jobTypes";
import { StandingOrderError } from "./StandingOrderError";
import { getStandingService } from "./standingServiceRegistry";
import {
  StandingOrderErrorKind,
  StewardVacancyReason,
  stewardAppointedEvent,
  stewardDismissedEvent,
} from "./standingTypes";
import type { StewardAppointed, StewardDismissed } from "./standingTypes";

/**
 * Whether a citizen may hold the Steward's office (spec 026 FR-013): an adult humanoid (a
 * citizen), a member of the player faction and not a Town Crier.
 *
 * @param engine - The engine.
 * @param entityId - The candidate.
 * @returns True when it may be appointed.
 */
export function isEligibleSteward(engine: GameEngine, entityId: EntityId): boolean {
  const entity = engine.store.get(entityId);
  const government = governmentFactionId(engine);
  return (
    entity !== undefined &&
    !engine.store.isPendingDelete(entityId) &&
    getComponent(entity, citizenComponent) !== undefined &&
    getComponent(entity, townCrierComponent) === undefined &&
    government !== null &&
    isMember(engine, entityId, government)
  );
}

/**
 * Appoints the Steward (command `AppointSteward`, spec 026 FR-013/016): there is at most one, a
 * different earlier holder is replaced (`steward.dismissed` with `Replaced`). Queues
 * `steward.appointed`; appointing the sitting Steward changes nothing.
 *
 * @param engine - The engine.
 * @param entityId - The citizen to appoint.
 * @returns True when the office changed hands.
 * @throws StandingOrderError `IneligibleSteward` for a non-citizen, a non-member, a Town Crier
 *   or an entity that does not exist.
 */
export function appointSteward(engine: GameEngine, entityId: EntityId): boolean {
  if (!isEligibleSteward(engine, entityId)) {
    throw new StandingOrderError(
      StandingOrderErrorKind.IneligibleSteward,
      `entity ${entityId} is not an adult citizen of the settlement that is not a Town Crier`,
    );
  }
  const state = getStandingService(engine).state;
  if (state.stewardEntityId === entityId) {
    return false;
  }
  if (state.stewardEntityId !== null) {
    vacateOffice(engine, StewardVacancyReason.Replaced);
  }
  state.stewardEntityId = entityId;
  const payload: StewardAppointed = { entityId };
  engine.bus.emit(stewardAppointedEvent, payload);
  return true;
}

/**
 * Empties the office and queues `steward.dismissed` with the reason (spec 026 FR-016).
 *
 * @param engine - The engine.
 * @param reason - Why the office is empty.
 * @returns True when somebody held it.
 */
export function vacateOffice(engine: GameEngine, reason: StewardVacancyReason): boolean {
  const state = getStandingService(engine).state;
  const entityId = state.stewardEntityId;
  if (entityId === null) {
    return false;
  }
  state.stewardEntityId = null;
  const payload: StewardDismissed = { entityId, reason };
  engine.bus.emit(stewardDismissedEvent, payload);
  return true;
}

/**
 * Dismisses the Steward (command `DismissSteward`): the office is empty, the orders keep their
 * runs and wait for a new Steward (the review is skipped meanwhile).
 *
 * @param engine - The engine.
 * @returns True when somebody held the office.
 */
export function dismissSteward(engine: GameEngine): boolean {
  return vacateOffice(engine, StewardVacancyReason.Dismissed);
}

/**
 * Sets or clears the Steward's own board (command `SetStewardBoard`, spec 026 FR-019): the board
 * orders without a board of their own post on.
 *
 * @param engine - The engine.
 * @param boardId - A user-managed board, or null to let the Steward choose by distance.
 * @throws StandingOrderError `BoardNotUserManaged`.
 */
export function setStewardBoard(engine: GameEngine, boardId: EntityId | null): void {
  if (boardId !== null && getBoard(engine, boardId)?.data.mode !== JobBoardMode.UserManaged) {
    throw new StandingOrderError(
      StandingOrderErrorKind.BoardNotUserManaged,
      `entity ${boardId} is not a user-managed job board`,
    );
  }
  getStandingService(engine).state.stewardBoardId = boardId;
}

/**
 * Asks for one extra review (command `RequestStewardReview`, spec 026 FR-017): it runs in the
 * next pass of slot 14 after this call; repeated requests collapse, the daily review does not
 * move.
 *
 * @param engine - The engine.
 */
export function requestStewardReview(engine: GameEngine): void {
  getStandingService(engine).state.extraReviewAfterTick ??= engine.time.tickCount;
}

/**
 * Keeps the office honest every tick (spec 026 FR-016): a Steward whose entity is gone has `Died`,
 * one that left the player faction `LeftFaction`.
 *
 * @param engine - The engine.
 * @returns True when the office was vacated.
 */
export function checkStewardOffice(engine: GameEngine): boolean {
  const entityId = getStandingService(engine).state.stewardEntityId;
  if (entityId === null) {
    return false;
  }
  const entity = engine.store.get(entityId);
  if (entity === undefined || engine.store.isPendingDelete(entityId)) {
    return vacateOffice(engine, StewardVacancyReason.Died);
  }
  const government = governmentFactionId(engine);
  if (government === null || !isMember(engine, entityId, government)) {
    return vacateOffice(engine, StewardVacancyReason.LeftFaction);
  }
  return false;
}
