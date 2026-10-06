import type { ReactNode } from "react";
import { formatMilli } from "./formatMilli";
import "./widgets.css";

/**
 * One stack of a {@link StackList}.
 */
export type StackRow = {
  materialId: string;
  /**
   * Display name; default the id with spaces.
   */
  name?: string;
  quantity: number;
  /**
   * Weight of one unit in thousandths; when given the row shows the total weight.
   */
  unitWeightMilli?: number;
  /**
   * Extra text after the quantity (for example `reserved 2`).
   */
  note?: ReactNode;
};

/**
 * A list of material stacks with quantities and weights, and optionally the capacity of the
 * holder (slots used of slots, weight of the limit).
 *
 * @param props - `stacks`, optional `slotCount` and `weightLimitMilli` (null for no limit) and the
 *   text for an empty list.
 * @returns The list.
 */
export function StackList(props: {
  stacks: readonly StackRow[];
  slotCount?: number;
  weightLimitMilli?: number | null;
  emptyText?: string;
}) {
  const totalWeight = props.stacks.reduce(
    (sum, stack) => sum + (stack.unitWeightMilli ?? 0) * stack.quantity,
    0,
  );
  const weighed =
    props.stacks.some((stack) => stack.unitWeightMilli !== undefined) ||
    props.weightLimitMilli !== undefined;
  const limit = props.weightLimitMilli ?? null;
  return (
    <div>
      {props.stacks.length === 0 ? (
        <p className="kv-dim">{props.emptyText ?? "Empty."}</p>
      ) : (
        <ul className="kv-stacks">
          {props.stacks.map((stack, index) => (
            <li key={`${stack.materialId}-${index}`}>
              <span>
                {stack.name ?? stack.materialId.replaceAll("_", " ")} x{stack.quantity}
                {stack.note === undefined ? null : <span className="kv-dim"> {stack.note}</span>}
              </span>
              {stack.unitWeightMilli === undefined ? null : (
                <span className="kv-dim">
                  {formatMilli(stack.unitWeightMilli * stack.quantity)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {props.slotCount === undefined && !weighed ? null : (
        <p className="kv-dim">
          {props.slotCount === undefined
            ? null
            : `Slots ${props.stacks.length} of ${props.slotCount}. `}
          {weighed
            ? `Weight ${formatMilli(totalWeight)}${limit === null ? "" : ` of ${formatMilli(limit)}`}.`
            : null}
        </p>
      )}
    </div>
  );
}
