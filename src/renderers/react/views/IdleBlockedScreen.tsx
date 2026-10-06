import { useState } from "react";
import type { IdleBlockedRow } from "../../../game/status/statusTypes";
import { useEngineHost } from "../engine/useEngineHost";
import { useQuery } from "../engine/useGameState";
import { blockedReasonTitle, describeBlockedReason } from "./blockedReasonText";
import { focusSubject } from "./focusSubject";
import { groupIdleBlocked } from "./groupIdleBlocked";
import { SubjectLabel } from "./SubjectLabel";
import "./views.css";

/**
 * The Idle and Blocked screen (spec 024 FR-026): every idle citizen and blocked workstation,
 * order, site, zone, board, posting or pile, grouped by the kind of its primary reason and sorted
 * by how long it has been stuck. Clicking a row selects the subject and asks the camera to centre
 * on it (`selection.requestFocus`), then shows the map.
 *
 * @returns The screen.
 */
export function IdleBlockedScreen() {
  const host = useEngineHost();
  const [includeUnsettled, setIncludeUnsettled] = useState(false);
  const result = useQuery<readonly IdleBlockedRow[]>("idle-blocked", { includeUnsettled });
  const groups = groupIdleBlocked(result.ok ? result.data : []);
  return (
    <section className="kv-screen kv-view">
      <h2>Idle and blocked</h2>
      <label className="kv-choice">
        <input
          type="checkbox"
          checked={includeUnsettled}
          onChange={(event) => setIncludeUnsettled(event.target.checked)}
        />
        Include those still settling
      </label>
      {groups.length === 0 ? <p>Nothing is idle or blocked.</p> : null}
      {groups.map((group) => (
        <section key={group.kind} className="kv-group" aria-label={blockedReasonTitle(group.kind)}>
          <h3>
            {blockedReasonTitle(group.kind)} <small>({group.rows.length})</small>
          </h3>
          <ul className="kv-rows">
            {group.rows.map((row) => (
              <li key={`${row.subject.kind}-${row.subject.id}`}>
                <button
                  type="button"
                  className="kv-row-button"
                  onClick={() => focusSubject(host, row.subject, row.reasons)}
                >
                  <SubjectLabel subject={row.subject} />
                  <span className="kv-row-detail">
                    {row.state}
                    {row.settled ? "" : " (settling)"} since tick {row.sinceTick}:{" "}
                    {row.reasons[0] === undefined ? "" : describeBlockedReason(row.reasons[0])}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
