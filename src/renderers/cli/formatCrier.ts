import { z } from "zod";
import type { JsonValue } from "../../game/engine/EventBus";

const changeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("add"), jobTypeId: z.string(), cellIndex: z.number() }),
  z.object({ kind: z.literal("remove"), postingId: z.number() }),
  z.object({ kind: z.literal("modify"), postingId: z.number() }),
  z.object({ kind: z.literal("run"), runId: z.number() }),
]);

const updateSchema = z.object({
  updateId: z.number(),
  boardId: z.number(),
  state: z.string(),
  crierId: z.number().nullable(),
  etaTicks: z.number().nullable(),
  progressPermille: z.number(),
  waitingFor: z.string().nullable(),
  changes: z.array(changeSchema),
});

const crierSchema = z.object({
  crierId: z.number(),
  status: z.string(),
  mapId: z.number().nullable(),
  cellIndex: z.number().nullable(),
  boardQueue: z.array(z.number()),
  carrying: z.array(z.number()),
});

type ChangeView = z.infer<typeof changeSchema>;

function describeChange(change: ChangeView): string {
  switch (change.kind) {
    case "add":
      return `post ${change.jobTypeId} at cell ${change.cellIndex}`;
    case "remove":
      return `remove posting #${change.postingId}`;
    case "modify":
      return `change posting #${change.postingId}`;
    case "run":
      return `start standing-order run #${change.runId}`;
  }
}

/**
 * Formats the `pending-updates` result for the `pending` verb: one line per update with what it
 * does, the board, and either the carrying crier with ETA and progress or why it still waits.
 *
 * @param updates - Data of the `pending-updates` query.
 * @returns Output lines; one line saying so when nothing is pending.
 */
export function formatPendingUpdates(updates: JsonValue): string[] {
  const parsed = z.array(updateSchema).safeParse(updates);
  if (!parsed.success || parsed.data.length === 0) {
    return ["no pending board updates"];
  }
  return parsed.data.map((update) => {
    const what = update.changes.map(describeChange).join(", ");
    const where =
      update.crierId === null
        ? `waiting for a crier (${update.waitingFor ?? "queued"})`
        : `carried by #${update.crierId}, eta ${update.etaTicks ?? "?"} ticks, ${Math.floor(update.progressPermille / 10)}% of the way`;
    return `update #${update.updateId} for board #${update.boardId}: ${what}; ${where}`;
  });
}

/**
 * Formats the `town-criers` result for the `crier` verb.
 *
 * @param criers - Data of the `town-criers` query.
 * @returns Output lines; one line saying so when the colony has no crier.
 */
export function formatCriers(criers: JsonValue): string[] {
  const parsed = z.array(crierSchema).safeParse(criers);
  if (!parsed.success || parsed.data.length === 0) {
    return ["no Town Criers (crier appoint <entityId>)"];
  }
  return parsed.data.map((crier) => {
    const where =
      crier.mapId === null ? "" : ` at map ${crier.mapId} cell ${crier.cellIndex ?? "?"}`;
    const load =
      crier.carrying.length === 0
        ? ""
        : `, carrying ${crier.carrying.map((id) => `#${id}`).join(" ")} to board ${crier.boardQueue.map((id) => `#${id}`).join(" ")}`;
    return `crier #${crier.crierId} ${crier.status}${where}${load}`;
  });
}
