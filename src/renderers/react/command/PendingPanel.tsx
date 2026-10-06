import type { BoardChange } from "../../../game/crier/crierTypes";
import type { PendingUpdateView } from "../../../game/crier/crierViews";
import type { PendingRouteView } from "../../../game/standing/standingViews";
import { useSender } from "./useSender";
import { useView } from "./useView";

/**
 * One line of text for a change of a pending board update.
 *
 * @param change - A board change (post, remove, modify or a standing-order run).
 * @returns The description.
 */
export function describeChange(change: BoardChange): string {
  // The change kinds are told apart by their fields (the enum is a game value the UI may not import).
  if ("jobTypeId" in change) {
    return `post ${change.jobTypeId} at cell ${change.cellIndex}`;
  }
  if ("runId" in change) {
    return `standing-order run #${change.runId}`;
  }
  if ("priority" in change) {
    return `change posting #${change.postingId}`;
  }
  return `remove posting #${change.postingId}`;
}

/**
 * The text of a pending update's timing: the Town Crier's ETA and progress, or what it waits for.
 *
 * @param update - A row of `pending-updates`.
 * @returns The timing text.
 */
export function describeTiming(update: PendingUpdateView): string {
  if (update.crierId === null) {
    return `waiting: ${update.waitingFor ?? update.state}`;
  }
  const eta = update.etaTicks === null ? "unknown" : `${update.etaTicks} ticks`;
  return `crier #${update.crierId}, ETA ${eta}, ${Math.round(update.progressPermille / 10)}% of the way`;
}

/**
 * The other ways a pending update can arrive (spec 024 FR-032): a crier carries it to the Notice
 * Post that serves its board, and a Bell Tower applies it at its next ring.
 *
 * @param route - A row of `pending-routes`, or undefined.
 * @returns The text, empty when only a crier walking to the board can deliver it.
 */
export function describeRoute(route: PendingRouteView | undefined): string {
  if (route === undefined) {
    return "";
  }
  const parts: string[] = [];
  if (route.noticePostId !== null) {
    parts.push(`Notice Post #${route.noticePostId}`);
  }
  if (route.nextBellRingTick !== null) {
    parts.push(`next bell ring at tick ${route.nextBellRingTick}`);
  }
  return parts.length === 0 ? "" : `also by: ${parts.join(" or ")}`;
}

/**
 * The pending board updates (commands a Town Crier has not delivered yet) with ETA, progress and
 * a cancel button, from the `pending-updates` query and `CancelPendingBoardUpdate`.
 *
 * @returns The list.
 */
export function PendingPanel() {
  const sender = useSender();
  const updates = useView<readonly PendingUpdateView[]>("pending-updates", {}) ?? [];
  const routes = useView<readonly PendingRouteView[]>("pending-routes", {}) ?? [];
  const routeText = new Map(routes.map((route) => [route.updateId, describeRoute(route)] as const));
  if (updates.length === 0) {
    return <p>No commands are waiting for a Town Crier.</p>;
  }
  return (
    <div className="kv-pending">
      <ul>
        {updates.map((update) => (
          <li key={update.updateId} data-update={update.updateId}>
            <strong>
              #{update.updateId} board #{update.boardId}
            </strong>
            : {update.changes.map(describeChange).join("; ")}
            <br />
            <span>{describeTiming(update)}</span>
            <span className="kv-dim"> {routeText.get(update.updateId)}</span>
            <progress max={1000} value={update.progressPermille} aria-label="Progress" />
            <button
              type="button"
              onClick={() =>
                sender.send({ kind: "CancelPendingBoardUpdate", updateId: update.updateId })
              }
            >
              Cancel
            </button>
          </li>
        ))}
      </ul>
      {sender.errors[""] === undefined ? null : (
        <p role="alert" className="kv-field-error">
          {sender.errors[""]}
        </p>
      )}
    </div>
  );
}
