import { formatCriers, formatPendingUpdates } from "../formatCrier";
import { parseCount, verbDone, verbFailed } from "./Verb";
import type { Verb, VerbContext, VerbOutput } from "./Verb";

const postUsage = "usage: post <boardId> <jobTypeId> <mapId> <cell> [priority]";
const pendingUsage = "usage: pending | pending cancel <updateId>";
const crierUsage = "usage: crier | crier appoint <entityId> | crier dismiss <entityId>";

function queue(
  context: VerbContext,
  command: { kind: string; [name: string]: string | number | boolean },
  done: string,
): VerbOutput {
  const result = context.session.dispatch(command);
  return result.ok
    ? verbDone([`queued ${command.kind}: ${done} (applied on the next tick)`])
    : verbFailed(`${result.error.kind}: ${result.error.message}`);
}

/**
 * Town Crier verbs (spec 017 US6): `post`, `unpost`, `pending`, `crier`. Changes to the
 * user-managed board are carried to it by a crier; `pending` shows where they are.
 */
export const crierVerbs: readonly Verb[] = [
  {
    name: "post",
    usage: "post <boardId> <jobTypeId> <mapId> <cell> [priority]",
    summary:
      "post a job on a user-managed board; a Town Crier carries it there (see pending), the board shows it on arrival",
    run: (args, context) => {
      const [boardText, jobTypeId, mapText, cellText, priorityText] = args;
      const boardId = parseCount(boardText);
      const mapId = parseCount(mapText);
      const cellIndex = parseCount(cellText);
      const priority = priorityText === undefined ? undefined : parseCount(priorityText);
      if (
        boardId === null ||
        jobTypeId === undefined ||
        mapId === null ||
        cellIndex === null ||
        priority === null ||
        args.length > 5
      ) {
        return verbFailed(postUsage);
      }
      return queue(
        context,
        {
          kind: "PostJob",
          boardId,
          jobTypeId,
          mapId,
          cellIndex,
          ...(priority === undefined ? {} : { priority }),
        },
        `${jobTypeId} at cell ${cellIndex} for board #${boardId}`,
      );
    },
  },
  {
    name: "unpost",
    usage: "unpost <boardId> <postingId>",
    summary: "take a posting off a user-managed board (carried by a Town Crier)",
    run: (args, context) => {
      const boardId = parseCount(args[0]);
      const postingId = parseCount(args[1]);
      if (boardId === null || postingId === null || args.length !== 2) {
        return verbFailed("usage: unpost <boardId> <postingId>");
      }
      return queue(
        context,
        { kind: "RemovePosting", boardId, postingId },
        `remove posting #${postingId} from board #${boardId}`,
      );
    },
  },
  {
    name: "pending",
    usage: "pending | pending cancel <updateId>",
    summary:
      "list the board updates a Town Crier has not delivered yet (crier, ETA, progress), or cancel one",
    run: (args, context) => {
      if (args[0] === "cancel") {
        const updateId = parseCount(args[1]);
        return updateId === null || args.length !== 2
          ? verbFailed(pendingUsage)
          : queue(
              context,
              { kind: "CancelPendingBoardUpdate", updateId },
              `cancel update #${updateId}`,
            );
      }
      if (args.length > 0) {
        return verbFailed(pendingUsage);
      }
      const updates = context.session.query.run("pending-updates", {});
      return updates.ok
        ? verbDone(formatPendingUpdates(updates.data))
        : verbFailed("the pending updates are not available (no game?)");
    },
  },
  {
    name: "crier",
    usage: "crier | crier appoint <entityId> | crier dismiss <entityId>",
    summary: "list the Town Criers, or appoint or dismiss one",
    run: (args, context) => {
      const [sub, idText] = args;
      if (sub === "appoint" || sub === "dismiss") {
        const entityId = parseCount(idText);
        return entityId === null || args.length !== 2
          ? verbFailed(crierUsage)
          : queue(
              context,
              { kind: sub === "appoint" ? "AppointTownCrier" : "DismissTownCrier", entityId },
              `${sub} #${entityId}`,
            );
      }
      if (args.length > 0) {
        return verbFailed(crierUsage);
      }
      const criers = context.session.query.run("town-criers", {});
      return criers.ok
        ? verbDone(formatCriers(criers.data))
        : verbFailed("the Town Criers are not available (no game?)");
    },
  },
];
