import type {
  ChronicleView,
  JournalView,
  MomentView,
} from "../../../game/chronicle/chronicleViews";
import { useEngineHost } from "../engine/useEngineHost";
import { useQuery } from "../engine/useGameState";
import { useStore } from "../engine/useStore";
import { blockedReasonTitle } from "./blockedReasonText";
import { chronicleRequests } from "./chronicleRequests";
import { focusEntity } from "./focusSubject";
import "./views.css";

/**
 * The kinds of notable moments a chronicle can be filtered by (serialized names).
 */
export const chronicleKinds: readonly string[] = [
  "arrived",
  "title_earned",
  "mastery_achieved",
  "became_finest",
  "lost_finest",
  "joined_guild",
  "left_guild",
  "took_office",
  "lost_office",
  "first_work",
  "first_trade",
  "home_improved",
  "renamed",
  "died",
  "settlement_milestone",
  "tier_reached",
];

function MomentList(props: { moments: readonly MomentView[]; reverse: boolean }) {
  const host = useEngineHost();
  const moments = props.reverse ? [...props.moments].reverse() : props.moments;
  if (moments.length === 0) {
    return <p>Nothing has been recorded yet.</p>;
  }
  return (
    <ol className="kv-moments">
      {moments.map((moment) => (
        <li key={moment.momentId} data-kind={moment.kind} data-prominence={moment.prominence}>
          <span className="kv-moment-when">
            Day {moment.day}, tick {moment.tick}
          </span>{" "}
          <span className="kv-badge">{blockedReasonTitle(moment.kind.replace(/_/g, " "))}</span>{" "}
          <span>{moment.text}</span>
          {moment.entityId === null ? null : (
            <>
              {" "}
              <button
                type="button"
                className="kv-link"
                onClick={() => {
                  if (moment.entityId !== null) {
                    chronicleRequests.set({
                      entityId: moment.entityId,
                      kind: null,
                      journal: true,
                    });
                  }
                }}
              >
                Journal
              </button>{" "}
              <button
                type="button"
                className="kv-link"
                onClick={() => {
                  if (moment.entityId !== null) {
                    focusEntity(host, moment.entityId);
                  }
                }}
              >
                Show on map
              </button>
            </>
          )}
        </li>
      ))}
    </ol>
  );
}

function Chronicle(props: { entityId: number | null; kind: string | null }) {
  const args: { limit: number; entityId?: number; kind?: string } = { limit: 200 };
  if (props.entityId !== null) {
    args.entityId = props.entityId;
  }
  if (props.kind !== null) {
    args.kind = props.kind;
  }
  const result = useQuery<ChronicleView>("chronicle", args);
  if (!result.ok) {
    return <p>The chronicle is not available.</p>;
  }
  return (
    <>
      <p>
        {result.data.moments.length} of {result.data.total} entries (the chronicle keeps{" "}
        {result.data.capacity}).
      </p>
      <MomentList moments={result.data.moments} reverse={false} />
    </>
  );
}

function Journal(props: { entityId: number }) {
  const result = useQuery<JournalView | null>("journal", { entityId: props.entityId });
  if (!result.ok || result.data === null) {
    return <p>This citizen has no journal.</p>;
  }
  return (
    <>
      <p>
        {result.data.entries.length} of {result.data.capacity} entries.
      </p>
      <MomentList moments={result.data.entries} reverse />
    </>
  );
}

/**
 * The journal of one citizen (Minor and Major entries, newest first) as a component: the citizen
 * panel's Journal tab (spec 024 FR-039) and the chronicle screen both render it.
 *
 * @param props - The citizen.
 * @returns The list.
 */
export function CitizenJournal(props: { entityId: number }) {
  return <Journal entityId={props.entityId} />;
}

/**
 * The chronicle screen (spec 024 FR-041): the Major moments of the settlement, newest first, with
 * the text rendered by the engine's `chronicle` query. Filter by moment kind or by citizen; a
 * citizen filter can switch to that citizen's full journal. The filter lives in
 * `chronicleRequests`, so a citizen panel or a toast can open the screen already filtered.
 *
 * @returns The screen.
 */
export function ChronicleScreen() {
  const request = useStore(chronicleRequests);
  const citizenText = request.entityId === null ? "" : String(request.entityId);
  return (
    <section className="kv-screen kv-view">
      <h2>Chronicle</h2>
      <div className="kv-filters">
        <label>
          Kind
          <select
            value={request.kind ?? ""}
            disabled={request.journal}
            onChange={(event) =>
              chronicleRequests.set({
                ...request,
                kind: event.target.value === "" ? null : event.target.value,
              })
            }
          >
            <option value="">All kinds</option>
            {chronicleKinds.map((kind) => (
              <option key={kind} value={kind}>
                {blockedReasonTitle(kind.replace(/_/g, " "))}
              </option>
            ))}
          </select>
        </label>
        <label>
          Citizen id
          <input
            type="number"
            min={1}
            value={citizenText}
            onChange={(event) => {
              const id = Math.floor(Number(event.target.value));
              chronicleRequests.set({
                ...request,
                entityId: event.target.value === "" || id < 1 ? null : id,
                journal: event.target.value === "" ? false : request.journal,
              });
            }}
          />
        </label>
        {request.entityId === null ? null : (
          <label className="kv-choice">
            <input
              type="checkbox"
              checked={request.journal}
              onChange={(event) =>
                chronicleRequests.set({ ...request, journal: event.target.checked })
              }
            />
            Full journal of this citizen
          </label>
        )}
        <button type="button" onClick={() => chronicleRequests.clear()}>
          Clear filters
        </button>
      </div>
      {request.journal && request.entityId !== null ? (
        <Journal entityId={request.entityId} />
      ) : (
        <Chronicle entityId={request.entityId} kind={request.kind} />
      )}
    </section>
  );
}
