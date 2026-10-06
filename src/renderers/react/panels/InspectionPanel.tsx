import { useEngineHost } from "../engine/useEngineHost";
import { useStore } from "../engine/useStore";
import { EntityInspection } from "./EntityInspection";
import { TileInspection } from "./TileInspection";

/**
 * The inspection side panel (spec 024, task 6.3): shows the selected entity (character, zone,
 * dwelling, workstation, build site, storage, ...) or the selected tile, driven by the selection
 * store. Its first line is always the primary status with the "why?" popover.
 *
 * @returns The panel body.
 */
export function InspectionPanel() {
  const host = useEngineHost();
  const selection = useStore(host.selection);
  if (selection.entityId !== null) {
    return <EntityInspection entityId={selection.entityId} />;
  }
  if (selection.cell !== null && selection.activeMapId !== null) {
    return <TileInspection mapId={selection.activeMapId} cell={selection.cell} />;
  }
  return <p className="kv-dim">Nothing selected.</p>;
}
