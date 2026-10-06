import { z } from "zod";
import { defineCommand } from "../api/defineCommand";
import { defineQuery } from "../api/defineQuery";
import { getComponent } from "../ecs/Entity";
import { jsonValueSchema } from "../ecs/jsonData";
import { InitMode } from "../engine/engineSystemTypes";
import type { GameEngine } from "../engine/GameEngine";
import { TickSlot } from "../engine/TickPipeline";
import { governmentFactionId } from "../factions/factionRegistry";
import { factionsSystemId } from "../factions/factionTypes";
import { identitySystemId } from "../identity/identityTypes";
import { treasurySystemId } from "../trade/tradeTypes";
import { DiplomacyError, DiplomacyErrorKind } from "./DiplomacyError";
import { DiplomacyService } from "./DiplomacyService";
import { bindDiplomacyService, getDiplomacyService } from "./diplomacyServiceRegistry";
import {
  DeclarationKind,
  DiplomaticActType,
  ProposalResponse,
  actRefusedEvent,
  diplomacySystemId,
} from "./diplomacyTypes";
import type { ActRefused } from "./diplomacyTypes";
import {
  buildAgreementViews,
  buildDiplomacyView,
  buildDirectiveViews,
  buildEnvoyViews,
  buildProposalViews,
} from "./diplomacyViews";
import { envoyComponent } from "./envoyComponent";
import { dispatchAct } from "./envoys";
import { cancelEnvoy, onEnvoyDeleted } from "./envoyTrips";
import { spawnNpcFactions } from "./npcFactions";
import { respondToProposal } from "./proposals";
import { runDiplomacy } from "./runDiplomacy";

const registered = new WeakSet<GameEngine>();

const idSchema = z.number().int().min(1);
const noArgs = z.object({}).strict();
const itemSchema = z
  .object({ materialId: z.string().min(1), quantity: z.number().int().min(1) })
  .strict();

const actSchema = z
  .object({
    actType: z.nativeEnum(DiplomaticActType),
    targetFactionId: idSchema,
    gift: z
      .union([
        z.array(itemSchema).min(1),
        z
          .object({ coins: z.number().int().min(0), items: z.array(itemSchema).default([]) })
          .strict(),
      ])
      .optional(),
    declaration: z.nativeEnum(DeclarationKind).optional(),
    terms: jsonValueSchema.optional(),
  })
  .strict();

type ActPayload = z.infer<typeof actSchema>;

function issueAct(engine: GameEngine, payload: ActPayload): { envoyId: number; etaTick: number } {
  const government = governmentFactionId(engine);
  try {
    if (government === null) {
      throw new DiplomacyError(DiplomacyErrorKind.UnknownFaction, "there is no settlement faction");
    }
    const gift = payload.gift;
    const envoy = dispatchAct(
      engine,
      government,
      payload.targetFactionId,
      {
        actType: payload.actType,
        declaration: payload.declaration ?? null,
        giftCoins: gift === undefined || Array.isArray(gift) ? 0 : gift.coins,
        giftItems: gift === undefined ? [] : Array.isArray(gift) ? gift : gift.items,
      },
      engine.time.tickCount,
    );
    return {
      envoyId: envoy.id,
      etaTick: getComponent(envoy, envoyComponent)?.arriveTick ?? engine.time.tickCount,
    };
  } catch (failure) {
    if (failure instanceof DiplomacyError) {
      const refused: ActRefused = {
        actType: payload.actType,
        targetFactionId: payload.targetFactionId,
        kind: failure.kind,
        message: failure.message,
      };
      engine.bus.emit(actRefusedEvent, refused);
    }
    throw failure;
  }
}

/**
 * Registers diplomacy with an engine (once per engine; the engine does it for itself, so every
 * game has it, after trade). It adds:
 * - the component `Envoy` and the save section `systems.diplomacy` (proposals, NPC act cooldowns);
 * - the init: the hostility multiplier of the game's difficulty, and on a new game the NPC
 *   factions of the content pack (`spawnNpcFactions`: seat, leader, heir, starting standing);
 * - a before-delete hook (an envoy deleted by something else fails `envoy-destroyed` and refunds
 *   its gift);
 * - the slot-11 system `diplomacy` (`runDiplomacy`: succession, proposals, envoys, NPC AI, decay);
 * - the commands `IssueDiplomaticAct`, `CancelDiplomaticDirective` and `RespondToProposal`
 *   (`SetFactionLeader` belongs to the factions system);
 * - the queries `factions-diplomacy`, `directives`, `agreements`, `envoys` and `proposals`.
 *
 * @param engine - The engine to extend; call before the first `newGame` / `loadGame`, after
 *   `registerTrade`.
 * @returns The engine's diplomacy service.
 */
export function registerDiplomacy(engine: GameEngine): DiplomacyService {
  if (registered.has(engine)) {
    return getDiplomacyService(engine);
  }
  registered.add(engine);
  const service = new DiplomacyService();
  bindDiplomacyService(engine, service);
  engine.store.addBeforeDeleteHook((entity) => {
    onEnvoyDeleted(engine, entity);
    return null;
  });
  engine.registerSystem({
    id: diplomacySystemId,
    dependencies: [factionsSystemId, identitySystemId, treasurySystemId, "world.starting-map"],
    slot: TickSlot.Diplomacy,
    order: 1,
    components: [envoyComponent],
    saveSection: service.createSection(),
    init: ({ engine: target, mode, options }) => {
      service.setHostilityMultiplierMilli(
        target.content.difficultyModes.require(options.difficulty).factionHostilityMultiplier,
      );
      if (mode === InitMode.NewGame) {
        spawnNpcFactions(target);
      }
    },
    run: (context) => {
      runDiplomacy(engine, context.tick);
    },
    commandHandlers: {
      IssueDiplomaticAct: defineCommand({
        schema: actSchema,
        handler: (payload, target) => issueAct(target, payload),
      }),
      CancelDiplomaticDirective: defineCommand({
        schema: z.object({ envoyId: idSchema }).strict(),
        handler: (payload, target) => {
          const envoy = target.store.get(payload.envoyId);
          if (envoy === undefined || getComponent(envoy, envoyComponent) === undefined) {
            throw new DiplomacyError(
              DiplomacyErrorKind.UnknownDirective,
              `envoy ${payload.envoyId} does not exist`,
            );
          }
          if (!cancelEnvoy(target, envoy)) {
            throw new DiplomacyError(
              DiplomacyErrorKind.NotCancellable,
              `envoy ${payload.envoyId} has already delivered or failed`,
            );
          }
          return { cancelled: true };
        },
      }),
      RespondToProposal: defineCommand({
        schema: z
          .object({
            proposalId: idSchema,
            response: z.nativeEnum(ProposalResponse),
            counter: jsonValueSchema.optional(),
          })
          .strict(),
        handler: (payload, target) => {
          respondToProposal(target, payload.proposalId, payload.response);
          return { proposalId: payload.proposalId, response: payload.response };
        },
      }),
    },
    queries: {
      "factions-diplomacy": defineQuery({
        schema: noArgs,
        run: (_args, target) => buildDiplomacyView(target),
      }),
      directives: defineQuery({
        schema: noArgs,
        run: (_args, target) => buildDirectiveViews(target),
      }),
      agreements: defineQuery({
        schema: noArgs,
        run: (_args, target) => buildAgreementViews(target),
      }),
      envoys: defineQuery({ schema: noArgs, run: (_args, target) => buildEnvoyViews(target) }),
      proposals: defineQuery({
        schema: noArgs,
        run: (_args, target) => buildProposalViews(target),
      }),
    },
  });
  return service;
}
