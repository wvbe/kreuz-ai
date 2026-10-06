import type { EntityDetailView } from "../../../game/api/Views";
import { StackList } from "../ui/StackList";
import { componentOf, useMaterialInfo } from "./entityViews";
import type { InventoryData } from "./entityViews";

/**
 * The Inventory tab: stacks with quantities and weights, slots used and the weight limit.
 *
 * @param props - The entity's `entity` view.
 * @returns The tab content.
 */
export function InventoryTab(props: { detail: EntityDetailView }) {
  const inventory = componentOf<InventoryData>(props.detail, "Inventory");
  const slots = inventory?.slots ?? [];
  const info = useMaterialInfo(slots.map((slot) => slot.materialId));
  if (inventory === undefined) {
    return <p className="kv-dim">This has no inventory.</p>;
  }
  return (
    <StackList
      stacks={slots.map((slot) => ({
        materialId: slot.materialId,
        quantity: slot.quantity,
        ...(info.get(slot.materialId) === undefined
          ? {}
          : {
              name: info.get(slot.materialId)?.name,
              unitWeightMilli: info.get(slot.materialId)?.weightMilli,
            }),
      }))}
      slotCount={inventory.slotCount}
      weightLimitMilli={inventory.weightLimitMilli}
      emptyText="Carrying nothing."
    />
  );
}
