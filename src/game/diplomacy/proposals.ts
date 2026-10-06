import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { governmentFactionId } from "../factions/factionRegistry";
import { applyAccepted } from "./actResolution";
import { DiplomacyError, DiplomacyErrorKind } from "./DiplomacyError";
import { getDiplomacyService } from "./diplomacyServiceRegistry";
import {
  ProposalResponse,
  proposalExpiredEvent,
  proposalReceivedEvent,
  proposalRespondedEvent,
} from "./diplomacyTypes";
import type {
  DiplomaticActType,
  Proposal,
  ProposalClosed,
  ProposalReceived,
} from "./diplomacyTypes";
import { adjustStanding } from "./standingRules";

/**
 * Records a proposal that an NPC faction's envoy brought to the player's leader (spec 021 FR-013)
 * and queues `diplomacy.proposal.received`. It lapses after `proposalExpiryTicks`.
 *
 * @param engine - The engine.
 * @param fromFactionId - The proposing faction.
 * @param actType - Overture or trade agreement.
 * @param tick - The current tick.
 * @returns The new proposal.
 */
export function receiveProposal(
  engine: GameEngine,
  fromFactionId: EntityId,
  actType: DiplomaticActType,
  tick: number,
): Proposal {
  const proposal = getDiplomacyService(engine).addProposal(
    fromFactionId,
    actType,
    tick,
    tick + engine.content.constants.proposalExpiryTicks,
  );
  const payload: ProposalReceived = {
    proposalId: proposal.proposalId,
    fromFactionId,
    actType,
    payload: {},
  };
  engine.bus.emit(proposalReceivedEvent, payload);
  return proposal;
}

/**
 * Answers an incoming proposal (`RespondToProposal`, D-14). Accept applies the acceptance (+10
 * both and the agreement flag for a trade agreement, +5 both for an overture); reject lowers the
 * settlement's view of the proposer by `rejectionPenalty`; counter closes the proposal without a
 * change (the counter-offer itself is a new `IssueDiplomaticAct`). Queues
 * `diplomacy.proposal.responded`.
 *
 * @param engine - The engine.
 * @param proposalId - The proposal.
 * @param response - The answer.
 */
export function respondToProposal(
  engine: GameEngine,
  proposalId: number,
  response: ProposalResponse,
): void {
  const proposal = getDiplomacyService(engine).removeProposal(proposalId);
  const government = governmentFactionId(engine);
  if (proposal === null || government === null) {
    throw new DiplomacyError(
      DiplomacyErrorKind.UnknownProposal,
      `proposal ${proposalId} does not exist`,
    );
  }
  if (engine.store.has(proposal.fromFactionId)) {
    if (response === ProposalResponse.Accept) {
      applyAccepted(engine, proposal.actType, government, proposal.fromFactionId);
    } else if (response === ProposalResponse.Reject) {
      adjustStanding(
        engine,
        government,
        proposal.fromFactionId,
        -engine.content.constants.rejectionPenalty,
      );
    }
  }
  const payload: ProposalClosed = {
    proposalId,
    fromFactionId: proposal.fromFactionId,
    actType: proposal.actType,
    response,
  };
  engine.bus.emit(proposalRespondedEvent, payload);
}

/**
 * Drops the proposals whose time has come or whose proposer no longer exists (slot 11), queueing
 * `diplomacy.proposal.expired` for each, ascending by id. No standing changes: ignoring a
 * proposal costs nothing.
 *
 * @param engine - The engine.
 * @param tick - The tick being processed.
 * @returns The number of proposals dropped.
 */
export function expireProposals(engine: GameEngine, tick: number): number {
  const service = getDiplomacyService(engine);
  let dropped = 0;
  for (const proposal of service.proposals()) {
    if (tick >= proposal.expiryTick || !engine.store.has(proposal.fromFactionId)) {
      service.removeProposal(proposal.proposalId);
      const payload: ProposalClosed = {
        proposalId: proposal.proposalId,
        fromFactionId: proposal.fromFactionId,
        actType: proposal.actType,
        response: "expired",
      };
      engine.bus.emit(proposalExpiredEvent, payload);
      dropped += 1;
    }
  }
  return dropped;
}
