import { ContentKind } from "../../../game/api/contentQueries";
import type { ContentEntryView } from "../../../game/api/contentQueries";
import type { EntityDetailView } from "../../../game/api/Views";
import type { IdentityView } from "../../../game/identity/identityViews";
import type { StewardView } from "../../../game/standing/standingViews";
import type { ZoneView } from "../../../game/zones/zoneTypes";
import type { NeedsView } from "../../../game/ai/aiViews";
import type { MembershipView } from "../../../game/factions/factionViews";
import type { SkillsView, TraitsView } from "../../../game/skills/skillViews";
import { useEngineHost } from "../engine/useEngineHost";
import { useQuery } from "../engine/useGameState";
import { EntityLink } from "../ui/EntityLink";
import { KeyValueList } from "../ui/KeyValueList";
import { NeedBar } from "../ui/NeedBar";
import { describeActiveNode } from "./describeActiveNode";
import { componentOf } from "./entityViews";
import { humanizeId } from "./reasonText";
import "./panels.css";

type PositionData = { mapId: number; cellIndex: number };
type AiStateData = { treeId: string | null; currentNode: number[]; running: boolean };

/**
 * Overview of a character: current action, needs with their values, mood and health, skills
 * with levels, traits, faction memberships and offices.
 *
 * @param props - The entity id.
 * @returns The sections.
 */
export function CitizenOverview(props: { entityId: number }) {
  const host = useEngineHost();
  const entity = useQuery("entity", { id: props.entityId });
  const detail: EntityDetailView | null = entity.ok ? entity.data : null;
  const position = detail === null ? undefined : componentOf<PositionData>(detail, "Position");
  const aiState = detail === null ? undefined : componentOf<AiStateData>(detail, "AiState");
  const zone = useQuery<ZoneView | null>("zone-at", {
    mapId: position?.mapId ?? 0,
    cellIndex: position?.cellIndex ?? 0,
  });
  const tree = useQuery<ContentEntryView | null>("content-entry", {
    kind: ContentKind.Behavior,
    id: aiState?.treeId ?? "",
  });
  const steward = useQuery<StewardView>("steward", {});
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
  const title = identity.ok ? (identity.data?.title ?? null) : null;
  const zoneView = zone.ok ? zone.data : null;
  const treeEntry = tree.ok ? tree.data : null;
  const activeNode =
    aiState?.treeId == null || treeEntry === null || aiState.currentNode.length === 0
      ? []
      : describeActiveNode(treeEntry.fields["root"], aiState.currentNode);
  const stewardId = steward.ok ? steward.data.stewardEntityId : null;
  const isSteward = stewardId === props.entityId;
  const isCitizen = detail !== null && componentOf<object>(detail, "Citizen") !== undefined;
  return (
    <div>
      {needsData === null ? null : (
        <>
          <KeyValueList
            rows={[
              { label: "Doing", value: needsData.action },
              {
                label: "Behavior",
                value:
                  aiState?.treeId == null
                    ? "none"
                    : [humanizeId(aiState.treeId), ...activeNode.slice(1)].join(" > "),
              },
              {
                label: "Zone",
                value:
                  zoneView === null ? (
                    "none"
                  ) : (
                    <EntityLink
                      entityId={zoneView.id}
                      label={`${humanizeId(zoneView.zoneTypeId)} #${zoneView.id}`}
                    />
                  ),
              },
              title === null
                ? null
                : { label: "Title", value: `${humanizeId(title.rank)} ${title.noun}` },
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
          {isSteward ? <li>Steward of the settlement</li> : null}
        </ul>
      )}
      {isCitizen ? (
        <p>
          {isSteward ? (
            <button type="button" onClick={() => host.commands.send({ kind: "DismissSteward" })}>
              Dismiss
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                host.commands.send({ kind: "AppointSteward", entityId: props.entityId })
              }
            >
              Appoint as Steward
            </button>
          )}
        </p>
      ) : null}
    </div>
  );
}
