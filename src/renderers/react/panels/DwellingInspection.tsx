import type { DwellingView, LevelRequirements } from "../../../game/housing/housingTypes";
import { useQuery } from "../engine/useGameState";
import { Checklist } from "../ui/Checklist";
import { KeyValueList } from "../ui/KeyValueList";
import { EntityNameLink } from "./EntityName";
import { PrimaryStatus } from "./PrimaryStatus";
import { humanizeId } from "./reasonText";
import { ZoneInspection } from "./ZoneInspection";
import "./panels.css";

function Requirements(props: { requirements: LevelRequirements }) {
  return (
    <Checklist
      items={props.requirements.requirements.map((requirement) => ({
        label: requirement.label,
        met: requirement.met,
      }))}
    />
  );
}

/**
 * Inspection of a dwelling: level, status with the why popover, residents, upgrade and downgrade
 * streaks against their grace days, the checklist of what the current level needs to keep and
 * what the next level needs, and the foods eaten lately.
 *
 * @param props - The dwelling's entity id (a dwelling is a zone).
 * @returns The panel body.
 */
export function DwellingInspection(props: { entityId: number }) {
  const result = useQuery<DwellingView | null>("dwelling", { id: props.entityId });
  const dwelling = result.ok ? result.data : null;
  if (dwelling === null) {
    // A room that is not active yet has no dwelling view: show it as the zone it is.
    return <ZoneInspection entityId={props.entityId} />;
  }
  return (
    <div className="kv-inspection" data-kind="dwelling">
      <h4 className="kv-inspection-title">Dwelling: {humanizeId(dwelling.level)}</h4>
      <PrimaryStatus id={props.entityId} />
      <KeyValueList
        rows={[
          { label: "Active", value: dwelling.active ? "yes" : "no" },
          { label: "Tiles", value: dwelling.tiles },
          { label: "Rent per day", value: dwelling.rentPerDay },
          {
            label: "Residents",
            value:
              dwelling.residents.length === 0 ? (
                "none"
              ) : (
                <span>
                  {dwelling.residents.map((resident) => (
                    <span key={resident}>
                      <EntityNameLink entityId={resident} />{" "}
                    </span>
                  ))}
                  <span className="kv-dim">
                    ({dwelling.residents.length} of {dwelling.capacity})
                  </span>
                </span>
              ),
          },
          {
            label: "Upgrade streak",
            value: `${dwelling.upgradeStreak} of ${dwelling.upgradeGraceDays} days`,
          },
          {
            label: "Downgrade streak",
            value: `${dwelling.downgradeStreak} of ${dwelling.downgradeGraceDays} days`,
          },
        ]}
      />
      <h4>To keep {humanizeId(dwelling.current.level)}</h4>
      <Requirements requirements={dwelling.current} />
      {dwelling.next === null ? null : (
        <>
          <h4>To reach {humanizeId(dwelling.next.level)}</h4>
          <Requirements requirements={dwelling.next} />
        </>
      )}
      {dwelling.foods.length === 0 ? null : (
        <>
          <h4>Foods eaten lately</h4>
          <p>{dwelling.foods.map(humanizeId).join(", ")}</p>
        </>
      )}
    </div>
  );
}
