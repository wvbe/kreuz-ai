import type { JsonValue } from "../../../game/engine/EventBus";
import {
  formatAgreements,
  formatDiplomacy,
  formatEnvoys,
  formatProposals,
} from "../formatDiplomacy";
import { parseCount, verbDone, verbFailed } from "./Verb";
import type { Verb, VerbContext, VerbOutput } from "./Verb";

const envoyUsage =
  "usage: envoy <factionId> agreement|overture|war|peace|neutrality | envoy cancel <envoyId> | envoy (lists every envoy)";
const giftUsage = "usage: gift <factionId> <coins> | gift <factionId> <materialId> <quantity>";

function show(
  context: VerbContext,
  name: string,
  format: (view: JsonValue) => string[],
  failure: string,
): VerbOutput {
  const result = context.session.query.run(name, {});
  return result.ok ? verbDone(format(result.data)) : verbFailed(failure);
}

function queue(
  context: VerbContext,
  command: { kind: string; [name: string]: JsonValue },
  done: string,
): VerbOutput {
  const result = context.session.dispatch(command);
  return result.ok
    ? verbDone([`queued ${command.kind}: ${done} (applied on the next tick)`])
    : verbFailed(`${result.error.kind}: ${result.error.message}`);
}

function act(context: VerbContext, factionId: number, kind: string): VerbOutput {
  if (kind === "agreement" || kind === "overture") {
    return queue(
      context,
      {
        kind: "IssueDiplomaticAct",
        actType: kind === "agreement" ? "trade-agreement" : "overture",
        targetFactionId: factionId,
      },
      `${kind} to faction #${factionId}`,
    );
  }
  if (kind === "war" || kind === "peace" || kind === "neutrality") {
    return queue(
      context,
      {
        kind: "IssueDiplomaticAct",
        actType: "declaration",
        targetFactionId: factionId,
        declaration: kind,
      },
      `declare ${kind} to faction #${factionId}`,
    );
  }
  return verbFailed(envoyUsage);
}

/**
 * Diplomacy verbs (spec 021, D-14, D-56): `diplomacy`, `gift`, `envoy`, `directives`,
 * `agreements`, `proposals`, `respond` and `leader`. Acts are carried by envoys: the verbs queue
 * `IssueDiplomaticAct`, `CancelDiplomaticDirective`, `RespondToProposal` and `SetFactionLeader`
 * and read the diplomacy queries.
 */
export const diplomacyVerbs: readonly Verb[] = [
  {
    name: "diplomacy",
    usage: "diplomacy",
    summary:
      "the other factions: standing both ways with its band (hostile, wary, neutral, friendly, allied), leader, agreements and envoys under way",
    run: (args, context) =>
      args.length > 0
        ? verbFailed("usage: diplomacy")
        : show(
            context,
            "factions-diplomacy",
            formatDiplomacy,
            "diplomacy is not available (no game?)",
          ),
  },
  {
    name: "gift",
    usage: "gift <factionId> <coins> | gift <factionId> <materialId> <quantity>",
    summary:
      "send a gift (coins or goods from the treasury) with an envoy: the faction's standing toward you rises when it arrives",
    run: (args, context) => {
      const factionId = parseCount(args[0]);
      if (factionId === null) {
        return verbFailed(giftUsage);
      }
      if (args.length === 2) {
        const coins = parseCount(args[1]);
        return coins === null || coins < 1
          ? verbFailed(giftUsage)
          : queue(
              context,
              {
                kind: "IssueDiplomaticAct",
                actType: "gift",
                targetFactionId: factionId,
                gift: { coins },
              },
              `gift ${coins} coins to faction #${factionId}`,
            );
      }
      const quantity = parseCount(args[2]);
      const materialId = args[1];
      if (args.length !== 3 || materialId === undefined || quantity === null || quantity < 1) {
        return verbFailed(giftUsage);
      }
      return queue(
        context,
        {
          kind: "IssueDiplomaticAct",
          actType: "gift",
          targetFactionId: factionId,
          gift: [{ materialId, quantity }],
        },
        `gift ${quantity} ${materialId} to faction #${factionId}`,
      );
    },
  },
  {
    name: "envoy",
    usage:
      "envoy <factionId> agreement|overture|war|peace|neutrality | envoy cancel <envoyId> | envoy",
    summary:
      "send an envoy with a trade agreement, an overture or a declaration; cancel one on its way; without arguments list all envoys",
    run: (args, context) => {
      if (args.length === 0) {
        return show(
          context,
          "envoys",
          (view) => formatEnvoys(view, "no envoys on the way"),
          "envoys are not available (no game?)",
        );
      }
      if (args[0] === "cancel") {
        const envoyId = parseCount(args[1]);
        return args.length !== 2 || envoyId === null
          ? verbFailed(envoyUsage)
          : queue(
              context,
              { kind: "CancelDiplomaticDirective", envoyId },
              `cancel envoy #${envoyId}`,
            );
      }
      const factionId = parseCount(args[0]);
      const kind = args[1];
      return args.length !== 2 || factionId === null || kind === undefined
        ? verbFailed(envoyUsage)
        : act(context, factionId, kind);
    },
  },
  {
    name: "directives",
    usage: "directives",
    summary:
      "the envoys you sent: act, target, ETA, what they carry (cancel one with envoy cancel)",
    run: (args, context) =>
      args.length > 0
        ? verbFailed("usage: directives")
        : show(
            context,
            "directives",
            (view) => formatEnvoys(view, "no directives pending (gift, envoy)"),
            "directives are not available (no game?)",
          ),
  },
  {
    name: "agreements",
    usage: "agreements",
    summary: "the trade agreements (they give a 10 % discount at the traders of that faction)",
    run: (args, context) =>
      args.length > 0
        ? verbFailed("usage: agreements")
        : show(context, "agreements", formatAgreements, "agreements are not available (no game?)"),
  },
  {
    name: "proposals",
    usage: "proposals",
    summary: "the overtures and trade agreements NPC factions offered you, waiting for an answer",
    run: (args, context) =>
      args.length > 0
        ? verbFailed("usage: proposals")
        : show(context, "proposals", formatProposals, "proposals are not available (no game?)"),
  },
  {
    name: "respond",
    usage: "respond <proposalId> accept|reject|counter",
    summary: "answer a proposal (reject costs a little standing; counter closes it for free)",
    run: (args, context) => {
      const proposalId = parseCount(args[0]);
      const response = args[1];
      return args.length !== 2 ||
        proposalId === null ||
        (response !== "accept" && response !== "reject" && response !== "counter")
        ? verbFailed("usage: respond <proposalId> accept|reject|counter")
        : queue(
            context,
            { kind: "RespondToProposal", proposalId, response },
            `${response} proposal #${proposalId}`,
          );
    },
  },
  {
    name: "leader",
    usage: "leader <factionId> <entityId|none>",
    summary:
      "set the leader of a faction (a member) or leave it leaderless; the next tick the faction picks a successor",
    run: (args, context) => {
      const factionId = parseCount(args[0]);
      const entityId = args[1] === "none" ? null : parseCount(args[1]);
      return args.length !== 2 || factionId === null || (entityId === null && args[1] !== "none")
        ? verbFailed("usage: leader <factionId> <entityId|none>")
        : queue(
            context,
            { kind: "SetFactionLeader", factionId, entityId },
            `leader of faction #${factionId} is ${entityId === null ? "none" : `#${entityId}`}`,
          );
    },
  },
];
