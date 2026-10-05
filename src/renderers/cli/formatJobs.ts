import { z } from "zod";
import type { JsonValue } from "../../game/engine/EventBus";

/**
 * Most history lines printed per board.
 */
export const maxPrintedHistory = 5;

const postingSchema = z.object({
  id: z.number(),
  jobTypeId: z.string(),
  target: z.object({ mapId: z.number(), cellIndex: z.number() }),
  priority: z.number(),
  urgent: z.boolean(),
  wage: z.number(),
  status: z.string(),
  claimantId: z.number().nullable(),
  reason: z.string().nullable(),
});

const boardViewSchema = z.object({
  boardId: z.number(),
  mapId: z.number().nullable(),
  cellIndex: z.number().nullable(),
  mode: z.string(),
  pausedByPlayer: z.boolean(),
  pausedBySystem: z.boolean(),
  open: z.number(),
  claimed: z.number(),
  postings: z.array(postingSchema),
  history: z.array(postingSchema),
});

type PostingView = z.infer<typeof postingSchema>;

function formatPosting(posting: PostingView): string {
  const holder = posting.claimantId === null ? "" : ` by #${posting.claimantId}`;
  const urgent = posting.urgent ? " urgent" : "";
  const reason = posting.reason === null ? "" : ` (${posting.reason})`;
  return `  #${posting.id} ${posting.jobTypeId} ${posting.status}${holder} prio ${posting.priority}${urgent} wage ${posting.wage} at cell ${posting.target.cellIndex}${reason}`;
}

/**
 * Formats one `jobs-on` result for the `jobs` verb: a header with mode, pause state and counts,
 * the active postings, and the last few finished ones.
 *
 * @param view - Data of the `jobs-on` query, or null for an unknown board.
 * @returns Output lines, empty when the view is not a board.
 */
export function formatBoard(view: JsonValue): string[] {
  const parsed = boardViewSchema.safeParse(view);
  if (!parsed.success) {
    return [];
  }
  const board = parsed.data;
  const pauses = [
    ...(board.pausedByPlayer ? ["player"] : []),
    ...(board.pausedBySystem ? ["system"] : []),
  ];
  const where = board.mapId === null ? "" : ` at map ${board.mapId} cell ${board.cellIndex ?? "?"}`;
  const header = `board #${board.boardId} ${board.mode}${where} ${pauses.length === 0 ? "running" : `paused by ${pauses.join("+")}`}: ${board.open} open, ${board.claimed} claimed`;
  const finished = board.history.slice(-maxPrintedHistory);
  return [
    header,
    ...(board.postings.length === 0 ? ["  no postings"] : board.postings.map(formatPosting)),
    ...(finished.length === 0 ? [] : ["  finished:", ...finished.map(formatPosting)]),
  ];
}
