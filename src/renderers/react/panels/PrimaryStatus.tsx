import { useQuery } from "../engine/useGameState";
import { describeActivity, describeReason } from "./reasonText";
import type { StatusExplanation } from "./statusViews";
import { WhyPopover } from "./WhyPopover";
import "./panels.css";

/**
 * The first line of every inspection (spec 024): the subject's state and primary reason (or what
 * it is doing while Active) with the "why?" popover next to it.
 *
 * @param props - The entity id (or posting/order id with its `kind`).
 * @returns The line; a quiet note for something without a status.
 */
export function PrimaryStatus(props: { id: number; kind?: string }) {
  const result = useQuery<StatusExplanation | null>(
    "explain",
    props.kind === undefined ? { id: props.id } : { id: props.id, kind: props.kind },
  );
  if (!result.ok || result.data === null) {
    return <p className="kv-status kv-dim">No status to report.</p>;
  }
  const status = result.data;
  const primary = status.reasons[0];
  const text =
    primary !== undefined
      ? describeReason(primary)
      : status.activity !== null
        ? describeActivity(status.activity)
        : status.state;
  return (
    <p className="kv-status" data-state={status.state}>
      <strong>{status.state}</strong>: {text} <WhyPopover id={props.id} kind={props.kind} />
    </p>
  );
}
