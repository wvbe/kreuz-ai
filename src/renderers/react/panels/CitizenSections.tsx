import type { EntityDetailView } from "../../../game/api/Views";
import type { IdentityView } from "../../../game/identity/identityViews";
import type { NeedsView } from "../../../game/ai/aiViews";
import type { MembershipView } from "../../../game/factions/factionViews";
import type { JournalView } from "../../../game/chronicle/chronicleViews";
import type { SkillsView, TraitsView } from "../../../game/skills/skillViews";
import { useEngineHost } from "../engine/useEngineHost";
import { useQuery } from "../engine/useGameState";
import { Screen } from "../navigation/Screen";
import { EntityLink, Link } from "../ui/EntityLink";
import { KeyValueList } from "../ui/KeyValueList";
import { NeedBar } from "../ui/NeedBar";
import { StackList } from "../ui/StackList";
import { componentOf, useMaterialInfo } from "./entityViews";
import type { InventoryData } from "./entityViews";
import "./panels.css";

/**
 * Journal lines the Journal tab shows (the newest ones); the chronicle holds the rest.
 */
export const journalLinesShown = 8;

/**
 * Overview of a character: current action, needs with their values, mood and health, skills
 * with levels, traits, faction memberships and offices.
 *
 * @param props - The entity id.
 * @returns The sections.
 */
export function CitizenOverview(props: { entityId: number }) {
  const needs = useQuery<NeedsView | null>("needs-of", { entityId: props.entityId });
  const skills = useQuery<SkillsView | null>("skills-of", { entityId: props.entityId });
  const traits = useQuery<TraitsView | null>("traits-of", { entityId: props.entityId });
  const identity = useQuery<IdentityView | null>("identity-of", { entityId: props.entityId });
  const factions = useQuery<MembershipView | null>("faction-of", { entityId: props.entityId });
  const needsData = needs.ok ? needs.data : null;
  const known =
    skills.ok && skills.data !== null ? skills.data.skills.filter((row) => row.level > 0) : [];
  const dominant = skills.ok ? (skills.data?.dominantSkill ?? null) : null;
  const traitRows = traits.ok && traits.data !== null ? traits.data.traits : [];
  const offices = identity.ok && identity.data !== null ? identity.data.offices : [];
  const memberships = factions.ok && factions.data !== null ? factions.data.factions : [];
  return (
    <div>
      {needsData === null ? null : (
        <>
          <KeyValueList
            rows={[
              { label: "Doing", value: needsData.action },
              { label: "Role", value: needsData.role },
              { label: "Wealth", value: `${needsData.wealth} (${needsData.coins} coins)` },
            ]}
          />
          <h4>Needs</h4>
          {needsData.needs.map((need) => (
            <NeedBar
              key={need.needId}
              label={need.name}
              percent={need.percent}
              critical={need.critical}
            />
          ))}
          <NeedBar label="Mood" percent={Math.floor(needsData.moodMilli / 1000)} />
          <NeedBar label="Health" percent={Math.floor(needsData.healthMilli / 1000)} />
        </>
      )}
      <h4>Skills</h4>
      {known.length === 0 ? (
        <p className="kv-dim">No trained skills.</p>
      ) : (
        <ul>
          {known.map((skill) => (
            <li key={skill.skillId}>
              {skill.name} {skill.level}
              {skill.skillId === dominant ? <span className="kv-dim"> (best)</span> : null}
            </li>
          ))}
        </ul>
      )}
      <h4>Traits</h4>
      {traitRows.length === 0 ? (
        <p className="kv-dim">None.</p>
      ) : (
        <ul>
          {traitRows.map((trait) => (
            <li key={trait.traitId}>
              {trait.name} <span className="kv-dim">{trait.effects.join("; ")}</span>
            </li>
          ))}
        </ul>
      )}
      <h4>Factions and offices</h4>
      {memberships.length === 0 && offices.length === 0 ? (
        <p className="kv-dim">No memberships.</p>
      ) : (
        <ul>
          {memberships.map((faction) => (
            <li key={faction.id}>
              Member of <EntityLink entityId={faction.id} label={faction.name} />
            </li>
          ))}
          {offices.map((office) => (
            <li key={`office-${office.factionId}`}>
              {office.leaderTitle} of {office.factionName}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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

/**
 * The Journal tab: the newest journal lines of a citizen and a link to the chronicle.
 *
 * @param props - The citizen's id.
 * @returns The tab content.
 */
export function JournalTab(props: { entityId: number }) {
  const host = useEngineHost();
  const journal = useQuery<JournalView | null>("journal", { entityId: props.entityId });
  const entries = journal.ok && journal.data !== null ? journal.data.entries : [];
  const shown = entries.slice(-journalLinesShown).reverse();
  return (
    <div>
      {shown.length === 0 ? (
        <p className="kv-dim">Nothing written yet.</p>
      ) : (
        <ul className="kv-journal">
          {shown.map((entry) => (
            <li key={entry.momentId}>
              <span className="kv-dim">Day {entry.day}:</span> {entry.text}
            </li>
          ))}
        </ul>
      )}
      <Link
        label="Open the chronicle"
        onClick={() => {
          host.navigation.navigate(Screen.Chronicle);
        }}
      />
    </div>
  );
}
