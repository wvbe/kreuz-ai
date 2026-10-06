import { useState } from "react";
import { useQuery } from "../engine/useGameState";
import { EntityLink } from "../ui/EntityLink";
import { describeActivity, describeReason, isEntitySubject } from "./reasonText";
import type { StatusExplanation, StatusSubject } from "./statusViews";
import "./panels.css";

/**
 * Most chain links drawn, whatever the engine sends (the engine caps the chain itself; this
 * keeps a malformed answer from flooding the popover).
 */
const maxChainLinks = 12;

const endNotes: ReadonlyMap<string, string> = new Map([
  ["Cycle", "The chain loops back to something already listed."],
  ["DepthCap", "The chain goes deeper; only the first causes are shown."],
  ["Gone", "The next cause no longer exists."],
]);

function SubjectName(props: { subject: StatusSubject; linked: boolean }) {
  const text = `${props.subject.kind} #${props.subject.id}`;
  return props.linked && isEntitySubject(props.subject) ? (
    <EntityLink entityId={props.subject.id} label={text} />
  ) : (
    <span>{text}</span>
  );
}

function Chain(props: { id: number; kind?: string }) {
  const result = useQuery<StatusExplanation | null>(
    "explain",
    props.kind === undefined ? { id: props.id } : { id: props.id, kind: props.kind },
  );
  if (!result.ok || result.data === null) {
    return <p className="kv-dim">Nothing to explain.</p>;
  }
  return <ExplanationView explanation={result.data} />;
}

/**
 * Renders an explanation: state, every reason and the cause chain as links. A subject that
 * appears twice in the chain is drawn once (so a looping chain cannot repeat itself), and at most
 * 12 links are drawn.
 *
 * @param props - The explanation of the `explain` query.
 * @returns The popover body.
 */
export function ExplanationView(props: { explanation: StatusExplanation }) {
  const { explanation } = props;
  const seen = new Set<string>();
  const links = explanation.chain
    .filter((link) => {
      const key = `${link.subject.kind}#${link.subject.id}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, maxChainLinks);
  return (
    <div>
      <p>
        <strong>{explanation.state}</strong>
        {explanation.activity === null ? null : (
          <span> - {describeActivity(explanation.activity)}</span>
        )}
      </p>
      {explanation.reasons.length === 0 ? null : (
        <ul className="kv-why-reasons">
          {explanation.reasons.map((reason, index) => (
            <li key={index}>{describeReason(reason)}</li>
          ))}
        </ul>
      )}
      {links.length < 2 ? null : (
        <div>
          <p className="kv-dim">Because:</p>
          <ol className="kv-why-chain" aria-label="Cause chain">
            {links.slice(1).map((link, index) => (
              <li key={index}>
                <SubjectName subject={link.subject} linked />: {link.state}
                {link.reason === null ? null : <span> - {describeReason(link.reason)}</span>}
                {link.activity === null ? null : <span> - {describeActivity(link.activity)}</span>}
              </li>
            ))}
          </ol>
          {endNotes.has(explanation.end) ? (
            <p className="kv-dim">{endNotes.get(explanation.end)}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * The "why?" button of an inspection line: opens a popover that runs `explain` and shows the
 * state, every reason and the cause chain. Each subject in the chain is a link that selects it.
 * The chain the engine sends stops at a cycle, so the popover cannot loop; it also draws at most
 * 12 links.
 *
 * @param props - The subject's id and, for postings and orders, its kind (entity subjects need
 *   none).
 * @returns The button and, when open, the popover.
 */
export function WhyPopover(props: { id: number; kind?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="kv-why">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
      >
        why?
      </button>
      {open ? (
        <div className="kv-why-popover" role="dialog" aria-label="Why?">
          <Chain id={props.id} kind={props.kind} />
        </div>
      ) : null}
    </span>
  );
}
