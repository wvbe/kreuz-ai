import { formatExplanation, formatFlow, formatFlowOf, formatIdleBlocked } from "../formatStatus";
import { parseCount, verbDone, verbFailed } from "./Verb";
import type { Verb } from "./Verb";

const whyUsage = "usage: why <entityId> | why posting <postingId> | why order <orderId>";

const kindWords: { [word: string]: string } = {
  posting: "JobPosting",
  order: "ProductionOrder",
};

/**
 * Status verbs: `why`, `idle` and `flow` (spec 025).
 */
export const statusVerbs: readonly Verb[] = [
  {
    name: "why",
    usage: "why <entityId> | why posting <postingId> | why order <orderId>",
    summary:
      "explain what a citizen, workstation, build site, zone, job board, loose pile, posting or order is doing or why it is stuck, with the chain of causes",
    run: (args, { session }) => {
      const first = args[0];
      const word = first === undefined ? undefined : kindWords[first];
      const id = parseCount(word === undefined ? first : args[1]);
      if (id === null || args.length !== (word === undefined ? 1 : 2)) {
        return verbFailed(whyUsage);
      }
      const answer = session.query.run("explain", word === undefined ? { id } : { id, kind: word });
      if (!answer.ok) {
        return verbFailed("no game is running");
      }
      const lines = formatExplanation(answer.data);
      return lines.length === 0
        ? verbFailed(`#${id} is not something that has a status`)
        : verbDone(lines);
    },
  },
  {
    name: "idle",
    usage: "idle [all]",
    summary:
      "list the idle citizens and the blocked workstations, orders, sites, zones, boards, postings and piles, oldest first (all: include those still settling)",
    run: (args, { session }) => {
      if (args.length > 1 || (args[0] !== undefined && args[0] !== "all")) {
        return verbFailed("usage: idle [all]");
      }
      const answer = session.query.run(
        "idle-blocked",
        args[0] === "all" ? { includeUnsettled: true } : {},
      );
      return answer.ok
        ? verbDone(formatIdleBlocked(answer.data))
        : verbFailed("no game is running");
    },
  },
  {
    name: "flow",
    usage: "flow [materialId]",
    summary:
      "the production flow: per material produced, consumed and net per day, stock and days of supply (largest deficit first); with a material, who produced and consumed it",
    run: (args, { session }) => {
      if (args.length > 1) {
        return verbFailed("usage: flow [materialId]");
      }
      const materialId = args[0];
      if (materialId === undefined) {
        const answer = session.query.run("flow", {});
        return answer.ok ? verbDone(formatFlow(answer.data)) : verbFailed("no game is running");
      }
      const answer = session.query.run("flow-of", { materialId });
      if (!answer.ok) {
        return verbFailed("no game is running");
      }
      const lines = formatFlowOf(answer.data);
      return lines.length === 0
        ? verbDone([`nothing recorded for ${materialId} in the last days`])
        : verbDone(lines);
    },
  },
];
