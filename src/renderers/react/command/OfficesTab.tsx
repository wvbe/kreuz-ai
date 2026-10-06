import { useMemo, useState } from "react";
import type { MapEntitiesView } from "../../../game/api/Views";
import type { TownCrierView } from "../../../game/crier/crierViews";
import type { BoardSummaryView } from "../../../game/jobs/jobViews";
import type { StewardView } from "../../../game/standing/standingViews";
import { useEngineHost } from "../engine/useEngineHost";
import { useGameVersion } from "../engine/useGameState";
import { useStore } from "../engine/useStore";
import { FormError } from "./FormField";
import { useSender } from "./useSender";
import { useView } from "./useView";

/**
 * One settler to choose in an office form.
 */
export type Settler = { id: number; label: string };

/**
 * The settlers of the active map (entities with a `Citizen` component) with their styled names,
 * for the appoint forms.
 *
 * @returns The settlers in id order.
 */
export function useSettlers(): readonly Settler[] {
  const host = useEngineHost();
  const version = useGameVersion();
  const selection = useStore(host.selection);
  const view = useView<MapEntitiesView>("map-entities", { mapId: selection.activeMapId ?? 1 });
  return useMemo(
    () =>
      (view?.entities ?? [])
        .filter((entity) => entity.components.includes("Citizen"))
        .map((entity) => {
          const identity = host.store.query("identity-of", { entityId: entity.id });
          const name = identity.ok
            ? (identity.data as { styledName?: string } | null)?.styledName
            : undefined;
          return { id: entity.id, label: `${name ?? entity.prototype} (#${entity.id})` };
        }),
    [host, version, view],
  );
}

type SettlerSelectProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

function SettlerSelect(props: SettlerSelectProps) {
  const settlers = useSettlers();
  return (
    <label className="kv-field">
      <span>{props.label}</span>
      <select value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        <option value="">Choose a settler</option>
        {settlers.map((settler) => (
          <option key={settler.id} value={settler.id}>
            {settler.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function StewardSection() {
  const sender = useSender();
  const steward = useView<StewardView>("steward", {});
  const boards = useView<readonly BoardSummaryView[]>("job-boards", {}) ?? [];
  const [pick, setPick] = useState("");
  if (steward === null) {
    return <p>The Steward is not available.</p>;
  }
  return (
    <section aria-label="Steward">
      <h4>Steward</h4>
      <p>
        {steward.stewardEntityId === null
          ? "No Steward appointed."
          : `Steward: settler #${steward.stewardEntityId}.`}{" "}
        Next review at tick {steward.nextReviewTick}
        {steward.lastReviewTick === null ? "" : `, last at tick ${steward.lastReviewTick}`};{" "}
        {steward.orders} standing orders.
      </p>
      <SettlerSelect label="Settler" value={pick} onChange={setPick} />
      <div className="kv-row-actions">
        <button
          type="button"
          disabled={pick === ""}
          onClick={() => sender.send({ kind: "AppointSteward", entityId: Number(pick) })}
        >
          Appoint Steward
        </button>
        <button type="button" onClick={() => sender.send({ kind: "DismissSteward" })}>
          Dismiss Steward
        </button>
        <button type="button" onClick={() => sender.send({ kind: "RequestStewardReview" })}>
          Request review
        </button>
      </div>
      <label className="kv-field">
        <span>Steward posts on board</span>
        <select
          value={steward.stewardBoardId === null ? "" : String(steward.stewardBoardId)}
          onChange={(event) =>
            sender.send({
              kind: "SetStewardBoard",
              boardId: event.target.value === "" ? null : Number(event.target.value),
            })
          }
        >
          <option value="">His own board</option>
          {boards.map((board) => (
            <option key={board.boardId} value={board.boardId}>
              Board #{board.boardId}
            </option>
          ))}
        </select>
      </label>
      <FormError message={sender.errors[""]} />
    </section>
  );
}

function CrierSection() {
  const sender = useSender();
  const criers = useView<readonly TownCrierView[]>("town-criers", {}) ?? [];
  const [pick, setPick] = useState("");
  return (
    <section aria-label="Town Criers">
      <h4>Town Criers</h4>
      {criers.length === 0 ? <p>No Town Crier appointed.</p> : null}
      <ul>
        {criers.map((crier) => (
          <li key={crier.crierId}>
            Crier #{crier.crierId}: {String(crier.status)}, {crier.boardQueue.length} boards queued{" "}
            <button
              type="button"
              onClick={() => sender.send({ kind: "DismissTownCrier", entityId: crier.crierId })}
            >
              Dismiss
            </button>
          </li>
        ))}
      </ul>
      <SettlerSelect label="Settler to appoint" value={pick} onChange={setPick} />
      <button
        type="button"
        disabled={pick === ""}
        onClick={() => sender.send({ kind: "AppointTownCrier", entityId: Number(pick) })}
      >
        Appoint Town Crier
      </button>
      <FormError message={sender.errors[""]} />
    </section>
  );
}

/**
 * The offices tab: the Steward (appoint, dismiss, his board, an extra review) and the Town Criers
 * (appoint, dismiss).
 *
 * @returns The tab.
 */
export function OfficesTab() {
  return (
    <div className="kv-offices">
      <StewardSection />
      <CrierSection />
    </div>
  );
}
