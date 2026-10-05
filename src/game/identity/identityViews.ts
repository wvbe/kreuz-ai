import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { identityComponent } from "./identityComponent";
import type { Office, Title } from "./identityTypes";
import { fullName } from "./nameText";
import { formatStyledName, stylePartsOf } from "./styledName";

/**
 * Plain view of a citizen's identity (query `identity-of`, spec 028 FR-011).
 */
export type IdentityView = {
  readonly entityId: number;
  readonly givenName: string;
  readonly byname: string | null;
  readonly nameOrdinal: number;
  readonly fullName: string;
  readonly title: Title | null;
  readonly offices: readonly Office[];
  readonly styledName: string;
};

/**
 * Builds the identity view of an entity.
 *
 * @param engine - The engine that owns the entities.
 * @param entity - The entity.
 * @returns The view, or null when the entity has no `Identity`.
 */
export function buildIdentityView(engine: GameEngine, entity: Entity): IdentityView | null {
  const identity = getComponent(entity, identityComponent);
  if (identity === undefined) {
    return null;
  }
  const parts = stylePartsOf(engine, entity, identity);
  return {
    entityId: entity.id,
    givenName: identity.givenName,
    byname: identity.byname,
    nameOrdinal: identity.nameOrdinal,
    fullName: fullName(identity.givenName, identity.byname),
    title: identity.titleSnapshot === null ? null : { ...identity.titleSnapshot },
    offices: parts.offices,
    styledName: formatStyledName(engine.content.nameFormats, parts),
  };
}
