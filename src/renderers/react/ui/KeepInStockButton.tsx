import { openStandingOrderForm } from "../views/standingOrderRequests";

/**
 * The "Keep in stock..." action of a material record, inventory row or recipe card (spec 024
 * FR-030): it opens the standing-order form prefilled with the material, so an order takes the
 * click, the target and the submit (spec 026 SC-008).
 *
 * @param props - The material to keep in stock and its display name for the accessible label.
 * @returns The button.
 */
export function KeepInStockButton(props: { materialId: string; name?: string }) {
  const label = props.name ?? props.materialId.replaceAll("_", " ");
  return (
    <button
      type="button"
      className="kv-keep-in-stock"
      aria-label={`Keep ${label} in stock`}
      onClick={() => openStandingOrderForm(props.materialId)}
    >
      Keep in stock...
    </button>
  );
}
