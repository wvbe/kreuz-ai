import type { EngineHost } from "../engine/EngineHost";
import { useEngineHost } from "../engine/useEngineHost";
import { placeOfEntity } from "./placeOfEntity";
import "./widgets.css";

/**
 * A text button that looks like a link and calls `onClick`.
 *
 * @param props - The text, the handler and an optional tooltip.
 * @returns The button.
 */
export function Link(props: { label: string; onClick: () => void; title?: string }) {
  return (
    <button type="button" className="kv-link" onClick={props.onClick} title={props.title}>
      {props.label}
    </button>
  );
}

/**
 * Selects an entity and, when it stands somewhere (or is a zone), asks the map to centre on it.
 *
 * @param host - The engine host.
 * @param entityId - The entity to select.
 */
export function selectAndFocus(host: EngineHost, entityId: number): void {
  const place = placeOfEntity(host.store.query("entity", { id: entityId }));
  host.selection.selectEntity(entityId, place === null ? null : place.cell);
  if (place !== null) {
    host.selection.requestFocus(place.mapId, place.cell);
  }
}

/**
 * A link that selects an entity (and centres the map on it when it has a place): the way every
 * panel and popover makes a subject clickable.
 *
 * @param props - The entity id and the text (default `#<id>`).
 * @returns The link.
 */
export function EntityLink(props: { entityId: number; label?: string }) {
  const host = useEngineHost();
  return (
    <Link
      label={props.label ?? `#${props.entityId}`}
      title={`Select #${props.entityId}`}
      onClick={() => {
        selectAndFocus(host, props.entityId);
      }}
    />
  );
}
