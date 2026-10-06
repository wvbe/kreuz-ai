import type { StockpileView } from "../../../game/storage/storageViews";
import { useQuery } from "../engine/useGameState";
import { KeyValueList } from "../ui/KeyValueList";
import { KeepInStockButton } from "../ui/KeepInStockButton";
import { StackList } from "../ui/StackList";
import { useMaterialInfo } from "./entityViews";
import { PrimaryStatus } from "./PrimaryStatus";
import { humanizeId } from "./reasonText";
import "./panels.css";

/**
 * Inspection of a stockpile (a storage furniture): priority, accepted goods, slots and contents.
 *
 * @param props - The storage entity id.
 * @returns The panel body.
 */
export function StockpileInspection(props: { entityId: number }) {
  const result = useQuery<readonly StockpileView[]>("stockpiles");
  const pile = result.ok ? result.data.find((row) => row.entityId === props.entityId) : undefined;
  const info = useMaterialInfo(pile?.contents.map((item) => item.materialId) ?? []);
  if (pile === undefined) {
    return <p>This storage is gone.</p>;
  }
  const filter = pile.filter;
  return (
    <div className="kv-inspection" data-kind="stockpile">
      <h4 className="kv-inspection-title">{humanizeId(pile.furnitureId ?? "storage")}</h4>
      <PrimaryStatus id={props.entityId} />
      <KeyValueList
        rows={[
          { label: "Priority", value: pile.priority },
          {
            label: "Accepts",
            value:
              filter === null
                ? "everything"
                : [...filter.categories, ...filter.materialIds].map(humanizeId).join(", "),
          },
          { label: "Reservations", value: pile.reservations.length },
        ]}
      />
      <h4>Contents</h4>
      <StackList
        stacks={pile.contents.map((item) => ({
          materialId: item.materialId,
          quantity: item.quantity,
          name: info.get(item.materialId)?.name,
          unitWeightMilli: info.get(item.materialId)?.weightMilli,
        }))}
        slotCount={pile.slots}
        weightLimitMilli={pile.weightLimitMilli}
        rowAction={(materialId) => <KeepInStockButton materialId={materialId} />}
      />
    </div>
  );
}
