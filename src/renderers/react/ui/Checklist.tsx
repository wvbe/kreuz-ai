import type { ReactNode } from "react";
import "./widgets.css";

/**
 * One line of a {@link Checklist}.
 */
export type ChecklistItem = {
  label: ReactNode;
  met: boolean;
  /**
   * Shown dimmed after the label (the numbers behind a gap).
   */
  detail?: ReactNode;
};

/**
 * A requirement checklist: met items get a tick, open ones a cross.
 *
 * @param props - `items` in display order.
 * @returns The list.
 */
export function Checklist(props: { items: readonly ChecklistItem[] }) {
  return (
    <ul className="kv-checklist">
      {props.items.map((item, index) => (
        <li key={index} data-met={item.met ? "true" : "false"}>
          {item.label}
          {item.detail === undefined ? null : <span className="kv-dim"> {item.detail}</span>}
        </li>
      ))}
    </ul>
  );
}
