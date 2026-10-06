import { ContentKind } from "../../../game/api/contentQueries";
import type { ContentEntryView } from "../../../game/api/contentQueries";
import type { CellView } from "../../../game/api/Views";
import type { ZoneView } from "../../../game/zones/zoneTypes";
import { useQuery } from "../engine/useGameState";
import { EntityLink } from "../ui/EntityLink";
import { KeyValueList } from "../ui/KeyValueList";
import { EntityNameLink } from "./EntityNameLink";
import { OccupantCycler } from "./OccupantCycler";
import { humanizeId } from "./reasonText";
import "./panels.css";

/**
 * Inspection of a tile: terrain, move cost, buildable, harvestable goods, the zone it belongs to
 * and the entities standing on it (with a button that cycles through them).
 *
 * @param props - The map and the cell.
 * @returns The panel body.
 */
export function TileInspection(props: { mapId: number; cell: number }) {
  const cell = useQuery<CellView>("cell", { mapId: props.mapId, cell: props.cell });
  const terrainId = cell.ok ? cell.data.terrain : "-";
  const terrain = useQuery<ContentEntryView | null>("content-entry", {
    kind: ContentKind.Terrain,
    id: terrainId,
  });
  const zone = useQuery<ZoneView | null>("zone-at", { mapId: props.mapId, cellIndex: props.cell });
  if (!cell.ok) {
    return <p>This tile is not on the map.</p>;
  }
  const view = cell.data;
  const definition = terrain.ok ? terrain.data : null;
  const harvest = definition?.links.filter((link) => link.role === "harvest") ?? [];
  const zoneView = zone.ok ? zone.data : null;
  return (
    <div className="kv-inspection" data-kind="tile">
      <h4 className="kv-inspection-title">Tile {props.cell}</h4>
      <p className="kv-status">
        {definition?.name ?? humanizeId(view.terrain)}:{" "}
        {view.traversable
          ? "open ground"
          : `blocked (${humanizeId(view.blockReason ?? "impassable")})`}
      </p>
      <KeyValueList
        rows={[
          { label: "Terrain", value: view.terrain },
          { label: "Move cost", value: view.moveCost },
          {
            label: "Buildable",
            value:
              definition === null
                ? "unknown"
                : definition.fields["buildable"] === true
                  ? "yes"
                  : "no",
          },
          harvest.length === 0
            ? null
            : { label: "Harvest", value: harvest.map((link) => link.name).join(", ") },
          {
            label: "Zone",
            value:
              zoneView === null ? (
                "none"
              ) : (
                <span>
                  <EntityLink
                    entityId={zoneView.id}
                    label={`${humanizeId(zoneView.zoneTypeId)} #${zoneView.id}`}
                  />{" "}
                  <span className="kv-dim">({zoneView.status})</span>
                </span>
              ),
          },
          {
            label: "Here",
            value:
              view.occupants.length === 0 ? (
                "nothing"
              ) : (
                <span>
                  {view.occupants.map((occupant) => (
                    <span key={occupant}>
                      <EntityNameLink entityId={occupant} />{" "}
                    </span>
                  ))}
                </span>
              ),
          },
        ]}
      />
      <OccupantCycler mapId={props.mapId} cell={props.cell} current={null} />
    </div>
  );
}
