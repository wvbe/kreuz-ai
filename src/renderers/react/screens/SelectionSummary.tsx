import type { EntityDetailView } from "../../../game/api/Views";
import { useEngineHost } from "../engine/useEngineHost";
import { useQuery } from "../engine/useGameState";
import { useStore } from "../engine/useStore";

type IdentityView = { styledName: string };

/**
 * The minimal selection panel of the shell: what is selected and where. The real inspection
 * panels of task 6.3 replace it.
 *
 * @returns The summary.
 */
export function SelectionSummary() {
  const host = useEngineHost();
  const selection = useStore(host.selection);
  const entity = useQuery("entity", { id: selection.entityId ?? 0 });
  const identity = useQuery<IdentityView | null>("identity-of", {
    entityId: selection.entityId ?? 0,
  });
  if (selection.entityId === null) {
    return <p>{selection.cell === null ? "Nothing selected." : `Cell ${selection.cell}`}</p>;
  }
  const detail: EntityDetailView | null = entity.ok ? entity.data : null;
  const name = identity.ok ? (identity.data?.styledName ?? null) : null;
  return (
    <dl>
      <dt>Entity</dt>
      <dd>
        {name ?? detail?.prototype ?? "unknown"} (#{selection.entityId})
      </dd>
      <dt>Prototype</dt>
      <dd>{detail?.prototype ?? "gone"}</dd>
      <dt>Cell</dt>
      <dd>{selection.cell ?? "-"}</dd>
    </dl>
  );
}
