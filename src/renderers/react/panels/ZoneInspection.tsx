import { ContentKind } from "../../../game/api/contentQueries";
import type { ContentEntryView } from "../../../game/api/contentQueries";
import type { StockpileView } from "../../../game/storage/storageViews";
import type { ZoneView } from "../../../game/zones/zoneTypes";
import { useQuery } from "../engine/useGameState";
import { Checklist } from "../ui/Checklist";
import { KeyValueList } from "../ui/KeyValueList";
import { StackList } from "../ui/StackList";
import type { StackRow } from "../ui/StackList";
import { useMaterialInfo } from "./entityViews";
import { EntityNameLink } from "./EntityName";
import { PrimaryStatus } from "./PrimaryStatus";
import { humanizeId } from "./reasonText";
import { zoneChecklist } from "./zoneChecklist";
import "./panels.css";

/**
 * The inventory of everything stored inside a zone: the stockpiles standing on its tiles, summed
 * per material.
 *
 * @param props - The zone.
 * @returns The stack list.
 */
export function ZoneInventory(props: { zone: ZoneView }) {
  const stockpiles = useQuery<readonly StockpileView[]>("stockpiles");
  const inside = stockpiles.ok
    ? stockpiles.data.filter(
        (pile) =>
          pile.mapId === props.zone.mapId &&
          pile.cellIndex !== null &&
          props.zone.tiles.includes(pile.cellIndex),
      )
    : [];
  const totals = new Map<string, number>();
  for (const pile of inside) {
    for (const item of pile.contents) {
      totals.set(item.materialId, (totals.get(item.materialId) ?? 0) + item.quantity);
    }
  }
  const ids = [...totals.keys()].sort();
  const info = useMaterialInfo(ids);
  const stacks: StackRow[] = ids.map((materialId) => ({
    materialId,
    quantity: totals.get(materialId) ?? 0,
    name: info.get(materialId)?.name,
  }));
  return (
    <StackList
      stacks={stacks}
      emptyText={inside.length === 0 ? "No storage in this zone." : "Nothing stored."}
    />
  );
}

/**
 * Inspection of a zone: type, status with the why popover, requirement checklist with its gaps,
 * workers and the aggregated inventory of its storage.
 *
 * @param props - The zone's entity id.
 * @returns The panel body.
 */
export function ZoneInspection(props: { entityId: number }) {
  const zoneResult = useQuery<ZoneView | null>("zone", { zoneId: props.entityId });
  const zone = zoneResult.ok ? zoneResult.data : null;
  const typeResult = useQuery<ContentEntryView | null>("content-entry", {
    kind: ContentKind.Zone,
    id: zone?.zoneTypeId ?? "-",
  });
  const type = typeResult.ok ? typeResult.data : null;
  if (zone === null) {
    return <p>This zone is gone.</p>;
  }
  const filter = zone.filter;
  return (
    <div className="kv-inspection" data-kind="zone">
      <h4 className="kv-inspection-title">{type?.name ?? humanizeId(zone.zoneTypeId)} zone</h4>
      <PrimaryStatus id={props.entityId} />
      <KeyValueList
        rows={[
          { label: "Status", value: zone.status },
          { label: "Tiles", value: `${zone.tiles.length}${zone.isRoom ? " (a room)" : ""}` },
          {
            label: "Accepts",
            value:
              filter === null
                ? "everything"
                : [...filter.categories, ...filter.materialIds].map(humanizeId).join(", "),
          },
          zone.affinity > 0
            ? { label: "Workers' familiarity", value: `${zone.affinity} of 10` }
            : null,
          {
            label: "Workers",
            value:
              zone.workers.length === 0 ? (
                "none"
              ) : (
                <span>
                  {zone.workers.map((worker) => (
                    <span key={worker}>
                      <EntityNameLink entityId={worker} />{" "}
                    </span>
                  ))}
                </span>
              ),
          },
        ]}
      />
      <h4>Requirements</h4>
      {type === null ? null : <Checklist items={zoneChecklist(zone, type)} />}
      <h4>Stored goods</h4>
      <ZoneInventory zone={zone} />
    </div>
  );
}
