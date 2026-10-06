import type { ReactNode } from "react";
import "./widgets.css";

/**
 * One row of a {@link KeyValueList}.
 */
export type KeyValueRow = {
  label: string;
  value: ReactNode;
};

/**
 * A two-column definition list (label, value). Null rows are skipped, so a caller can write
 * `condition ? { label, value } : null`.
 *
 * @param props - `rows` in display order.
 * @returns The list.
 */
export function KeyValueList(props: { rows: readonly (KeyValueRow | null)[] }) {
  return (
    <dl className="kv-kv">
      {props.rows.map((row) =>
        row === null ? null : (
          <div key={row.label} style={{ display: "contents" }}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ),
      )}
    </dl>
  );
}
