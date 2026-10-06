import type { EntityDetailView } from "../../../game/api/Views";
import { useQuery } from "../engine/useGameState";
import { EntityLink } from "../ui/EntityLink";
import { humanizeId } from "./reasonText";

type IdentityName = { styledName: string };

/**
 * The display name of an entity: the styled name of a citizen, otherwise its prototype in words,
 * otherwise `#id`.
 *
 * @param entityId - The entity.
 * @returns The name.
 */
export function useEntityName(entityId: number): string {
  const identity = useQuery<IdentityName | null>("identity-of", { entityId });
  const entity = useQuery("entity", { id: entityId });
  if (identity.ok && identity.data !== null) {
    return identity.data.styledName;
  }
  const detail: EntityDetailView | null = entity.ok ? entity.data : null;
  return detail === null ? `#${entityId}` : humanizeId(detail.prototype);
}

/**
 * A link to an entity labelled with its display name.
 *
 * @param props - The entity id.
 * @returns The link.
 */
export function EntityNameLink(props: { entityId: number }) {
  const name = useEntityName(props.entityId);
  return <EntityLink entityId={props.entityId} label={name} />;
}
