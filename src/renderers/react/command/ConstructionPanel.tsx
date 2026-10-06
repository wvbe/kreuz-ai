import { useState } from "react";
import type { ConstructionQueueView, SiteView } from "../../../game/construction/constructionViews";
import type { EntityDetailView } from "../../../game/api/Views";
import { useEngineHost } from "../engine/useEngineHost";
import { useStore } from "../engine/useStore";
import type { BuildMenuEntry } from "./buildMenuModel";
import { parseWhole } from "./commandPayloads";
import { useSender } from "./useSender";
import { useView } from "./useView";

type SiteRowProps = { site: SiteView; selected: boolean };

function SiteRow(props: SiteRowProps) {
  const host = useEngineHost();
  const sender = useSender();
  const [priority, setPriority] = useState(String(props.site.priority));
  const { site } = props;
  const parsed = parseWhole(priority);
  return (
    <li className={props.selected ? "kv-selected" : undefined} data-job={site.jobId}>
      <button
        type="button"
        onClick={() => host.selection.requestFocus(site.mapId, site.cellIndex)}
        title="Show on the map"
      >
        #{site.jobId} {site.kind === "Deconstruction" ? "take down" : "build"} {site.prototypeId}
      </button>{" "}
      <span>
        {site.status}
        {site.paused ? ", paused" : ""}, {site.progress}/{site.durationTicks}
      </span>
      <div className="kv-row-actions">
        <button
          type="button"
          onClick={() =>
            sender.send({
              kind: "SetConstructionJobPaused",
              jobId: site.jobId,
              paused: !site.paused,
            })
          }
        >
          {site.paused ? "Resume" : "Pause"}
        </button>
        <button
          type="button"
          onClick={() => sender.send({ kind: "MoveConstructionJobToFront", jobId: site.jobId })}
        >
          To front
        </button>
        <input
          aria-label={`Priority of job ${site.jobId}`}
          size={3}
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
        />
        <button
          type="button"
          disabled={parsed === null}
          onClick={() =>
            sender.send({
              kind: "SetConstructionPriority",
              jobId: site.jobId,
              priority: parsed ?? 0,
            })
          }
        >
          Set priority
        </button>
        <button
          type="button"
          onClick={() => sender.send({ kind: "CancelConstructionJob", jobId: site.jobId })}
        >
          Cancel
        </button>
      </div>
      {sender.errors[""] === undefined ? null : (
        <p role="alert" className="kv-field-error">
          {sender.errors[""]}
        </p>
      )}
    </li>
  );
}

/**
 * The construction panel: the queue of sites with pause, priority, front and cancel, and, for the
 * piece selected on the map, a button to cancel its site or take the built piece down
 * (`QueueDeconstruction`).
 *
 * @returns The panel.
 */
export function ConstructionPanel() {
  const host = useEngineHost();
  const selection = useStore(host.selection);
  const sender = useSender();
  const queue = useView<ConstructionQueueView>("construction-queue", {});
  const menu = useView<readonly BuildMenuEntry[]>("build-menu", {});
  const detail = useView<EntityDetailView | null>("entity", { id: selection.entityId ?? 0 });
  const sites = queue?.jobs ?? [];
  const selectedSite = sites.find((site) => site.jobId === selection.entityId) ?? null;
  const builtPiece =
    selectedSite === null && detail !== null && !detail.components["BuildSite"]
      ? (menu ?? []).find((entry) => entry.id === detail.prototype)
      : undefined;
  return (
    <div className="kv-construction">
      {builtPiece !== undefined && selection.entityId !== null ? (
        <p>
          Selected: {builtPiece.name}{" "}
          <button
            type="button"
            onClick={() =>
              sender.send({ kind: "QueueDeconstruction", targetEntityId: selection.entityId ?? 0 })
            }
          >
            Deconstruct
          </button>
        </p>
      ) : null}
      {selectedSite === null ? null : <p>Selected site #{selectedSite.jobId}: cancel it below.</p>}
      {sites.length === 0 ? <p>No construction jobs.</p> : null}
      <ul className="kv-site-list">
        {sites.map((site) => (
          <SiteRow key={site.jobId} site={site} selected={site.jobId === selection.entityId} />
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
