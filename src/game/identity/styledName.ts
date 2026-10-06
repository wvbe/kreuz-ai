import type { NameFormatsContent } from "../content/schemas/tableSchemas";
import { getComponent } from "../ecs/Entity";
import type { Entity, EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { factionComponent } from "../factions/factionComponent";
import { governmentFactionId, listFactions } from "../factions/factionRegistry";
import { getStandingService } from "../standing/standingServiceRegistry";
import { identityComponent } from "./identityComponent";
import { TitleRank } from "./identityTypes";
import type { IdentityData, Office, Title } from "./identityTypes";
import { romanNumeral } from "./nameText";

/**
 * What the styled name is built from.
 */
export type StyledNameParts = {
  givenName: string;
  byname: string | null;
  nameOrdinal: number;
  title: Title | null;
  offices: readonly Office[];
};

function fill(template: string, values: { readonly [key: string]: string }): string {
  let text = template;
  for (const [key, value] of Object.entries(values)) {
    text = text.replaceAll(`{${key}}`, value);
  }
  return text;
}

/**
 * Pure formatter of the styled name (spec 028 FR-011) from the `name-formats` templates: plain
 * `{given} {byname}` (a missing byname leaves the given name alone), Practitioner
 * `{given} the {noun}`, Master `{given}, Master {noun}`, then one suffix per office: the
 * `officeSuffixMaster` form when the leader title equals the Master title, else
 * `officeSuffixOther`. A name ordinal is shown as a roman numeral after the plain name
 * ("Ansel atte Brook II") or after the given name when a title replaces the byname
 * ("Ansel II the Baker").
 *
 * @param formats - Name format templates of the content pack.
 * @param parts - Names, title and offices.
 * @returns The styled name.
 */
export function formatStyledName(formats: NameFormatsContent, parts: StyledNameParts): string {
  const numeral = parts.nameOrdinal >= 2 ? romanNumeral(parts.nameOrdinal) : "";
  const given =
    numeral === "" || parts.title === null ? parts.givenName : `${parts.givenName} ${numeral}`;
  let text: string;
  let masterTitle = "";
  if (parts.title === null) {
    text = fill(formats.plain, { given, byname: parts.byname ?? "" }).trim();
    text = numeral === "" ? text : `${text} ${numeral}`;
  } else if (parts.title.rank === TitleRank.Master) {
    text = fill(formats.master, { given, noun: parts.title.noun });
    masterTitle = fill(formats.master, { given: "", noun: parts.title.noun }).replace(
      /^[,\s]+/,
      "",
    );
  } else {
    text = fill(formats.practitioner, { given, noun: parts.title.noun });
  }
  for (const office of parts.offices) {
    text += fill(
      office.leaderTitle === masterTitle ? formats.officeSuffixMaster : formats.officeSuffixOther,
      { factionName: office.factionName, leaderTitle: office.leaderTitle },
    );
  }
  return text;
}

/**
 * The offices a citizen holds: every faction it leads that has a leader title, ascending by
 * faction id, then the Steward's office of the player government when it is the Steward (spec 028
 * FR-009; the title text is `stewardTitle` of the name formats).
 *
 * @param engine - The engine that owns the entities.
 * @param entityId - The citizen.
 * @returns The offices.
 */
export function officesOf(engine: GameEngine, entityId: EntityId): Office[] {
  const offices: Office[] = [];
  for (const entity of listFactions(engine)) {
    const faction = getComponent(entity, factionComponent);
    if (faction !== undefined && faction.leaderId === entityId && faction.leaderTitle !== "") {
      offices.push({
        factionId: entity.id,
        factionName: faction.name,
        leaderTitle: faction.leaderTitle,
      });
    }
  }
  const government = governmentFactionId(engine);
  const governmentFaction = government === null ? undefined : engine.store.get(government);
  const governmentData =
    governmentFaction === undefined ? undefined : getComponent(governmentFaction, factionComponent);
  if (
    government !== null &&
    governmentData !== undefined &&
    getStandingService(engine).state.stewardEntityId === entityId
  ) {
    offices.push({
      factionId: government,
      factionName: governmentData.name,
      leaderTitle: engine.content.nameFormats.stewardTitle,
    });
  }
  return offices;
}

/**
 * The parts of a citizen's styled name, read from its `Identity` snapshot and the factions.
 *
 * @param engine - The engine that owns the entities.
 * @param entity - The citizen.
 * @param identity - Its identity data.
 * @returns Names, title and offices.
 */
export function stylePartsOf(
  engine: GameEngine,
  entity: Entity,
  identity: IdentityData,
): StyledNameParts {
  return {
    givenName: identity.givenName,
    byname: identity.byname,
    nameOrdinal: identity.nameOrdinal,
    title: identity.titleSnapshot,
    offices: officesOf(engine, entity.id),
  };
}

/**
 * The styled name of an entity (spec 028 FR-011), e.g. "Ansel, Master Baker of the Bakers' guild".
 *
 * @param engine - The engine that owns the entities.
 * @param entity - The entity.
 * @returns The styled name, or null when the entity has no `Identity`.
 */
export function styledName(engine: GameEngine, entity: Entity): string | null {
  const identity = getComponent(entity, identityComponent);
  return identity === undefined
    ? null
    : formatStyledName(engine.content.nameFormats, stylePartsOf(engine, entity, identity));
}
