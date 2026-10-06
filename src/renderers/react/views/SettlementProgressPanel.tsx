import type { MilestoneView } from "../../../game/settlement/settlementViews";
import type { SettlementProgressView, UnlockView } from "../../../game/settlement/settlementTypes";
import { useQuery } from "../engine/useGameState";
import { humanizeId } from "./blockedReasonText";
import "./views.css";

/**
 * Capitalised words of a tier or milestone id (`market_town` is `Market town`).
 *
 * @param id - A serialized tier or milestone.
 * @returns Display text.
 */
export function tierTitle(id: string): string {
  const words = humanizeId(id);
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function UnlocksPreview(props: { nextTier: string }) {
  const result = useQuery<readonly UnlockView[]>("unlocks", { tier: props.nextTier });
  const locked = (result.ok ? result.data : []).filter((entry) => !entry.unlocked);
  if (locked.length === 0) {
    return null;
  }
  return (
    <>
      <h4>Unlocks at {tierTitle(props.nextTier)}</h4>
      <ul className="kv-rows" aria-label="Unlocks preview">
        {locked.map((entry) => (
          <li key={`${entry.contentKind}-${entry.contentId}`}>
            {entry.name} <small>({humanizeId(entry.contentKind)})</small>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * The settlement progress panel (spec 024 FR-034): the tier and its settlement noun, the checklist
 * of what the next tier needs with a progress bar per requirement, a preview of what the next tier
 * unlocks, and the seven milestones. It docks beside the map and fills the Settlement screen.
 *
 * @returns The panel.
 */
export function SettlementProgressPanel() {
  const progress = useQuery<SettlementProgressView | null>("settlement-progress", {});
  const milestones = useQuery<readonly MilestoneView[]>("milestones", {});
  if (!progress.ok || progress.data === null) {
    return <p>The settlement is not available.</p>;
  }
  const view = progress.data;
  return (
    <div className="kv-progress">
      <p className="kv-tier">
        <strong>{tierTitle(view.tier)}</strong> <small>({view.settlementNoun})</small>
      </p>
      {view.nextTier === null ? (
        <p>The settlement has reached the highest tier.</p>
      ) : (
        <>
          <h4>
            Next: {tierTitle(view.nextTier)}
            {view.nextSettlementNoun === null ? "" : ` (${view.nextSettlementNoun})`}
          </h4>
          <ul className="kv-checklist" aria-label="Next tier requirements">
            {view.requirements.map((requirement) => (
              <li key={requirement.label} data-met={requirement.met}>
                <span aria-hidden="true">{requirement.met ? "[x]" : "[ ]"}</span>{" "}
                <span>{requirement.label}</span>
                <progress
                  max={Math.max(1, requirement.target)}
                  value={Math.min(requirement.current, Math.max(1, requirement.target))}
                  aria-label={requirement.label}
                />
              </li>
            ))}
          </ul>
          <UnlocksPreview nextTier={view.nextTier} />
        </>
      )}
      <h4>Milestones</h4>
      <ul className="kv-rows" aria-label="Milestones">
        {(milestones.ok ? milestones.data : []).map((entry) => (
          <li key={entry.milestone} data-reached={entry.reached}>
            {entry.reached ? "[x]" : "[ ]"} {tierTitle(entry.milestone)}{" "}
            <small>{entry.tick === null ? "not yet" : `tick ${entry.tick}`}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}
