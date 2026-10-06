import { useQuery } from "../engine/useGameState";
import type { SubjectRef } from "./focusSubject";

type IdentityView = { styledName: string };

/**
 * The name of a status subject: the styled name of a citizen, otherwise the kind and id
 * (`Workstation #11`).
 *
 * @param props - The subject.
 * @returns The label text.
 */
export function SubjectLabel(props: { subject: SubjectRef }) {
  const isCitizen = props.subject.kind === "Citizen";
  const identity = useQuery<IdentityView | null>("identity-of", {
    entityId: isCitizen ? props.subject.id : 0,
  });
  const name = isCitizen && identity.ok ? (identity.data?.styledName ?? null) : null;
  return (
    <span>
      {name ?? props.subject.kind.replace(/([a-z0-9])([A-Z])/g, "$1 $2")}{" "}
      <small>#{props.subject.id}</small>
    </span>
  );
}
