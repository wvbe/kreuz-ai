import "./widgets.css";

/**
 * A labelled meter from 0 to 100 percent; a critical value is drawn red.
 *
 * @param props - `label` (shown and used as the accessible name), `percent` (0 to 100),
 *   `critical` (red fill) and optional `valueText` (default `<percent>%`).
 * @returns The bar.
 */
export function NeedBar(props: {
  label: string;
  percent: number;
  critical?: boolean;
  valueText?: string;
}) {
  const percent = Math.max(0, Math.min(100, props.percent));
  return (
    <div
      className="kv-needbar"
      role="meter"
      aria-label={props.label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      data-critical={props.critical === true ? "true" : "false"}
    >
      <span>{props.label}</span>
      <span className="kv-needbar-track">
        <span className="kv-needbar-fill" style={{ display: "block", width: `${percent}%` }} />
      </span>
      <span>{props.valueText ?? `${percent}%`}</span>
    </div>
  );
}
