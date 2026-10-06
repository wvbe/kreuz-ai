import type { MapEntitiesView, MapListView } from "../../../game/api/Views";
import type { ZoneView } from "../../../game/zones/zoneTypes";
import type { EngineHost } from "../engine/EngineHost";
import { Screen } from "../navigation/Screen";
import type { ReasonLike } from "./blockedReasonText";

/**
 * A pointer to a status subject: its serialized kind and id (what events and queries carry).
 */
export type SubjectRef = { kind: string; id: number };

/**
 * Where something stands: the map and the cell.
 */
export type SubjectLocation = {
  mapId: number;
  cell: number;
  /**
   * The entity to select, or null for a zone (its first tile is selected instead).
   */
  entityId: number | null;
};

const zoneKind = "Zone";
const paramsNamingAnEntity: readonly string[] = [
  "entityId",
  "workstationId",
  "boardId",
  "jobBoardId",
  "siteId",
];

function entityLocation(host: EngineHost, entityId: number): SubjectLocation | null {
  const maps = host.store.query("maps");
  if (!maps.ok) {
    return null;
  }
  // The `maps` query returns exactly a MapListView (see api/Views.ts).
  // eslint-disable-next-line no-restricted-syntax -- JSON to the documented view type of the query name
  const list = maps.data as unknown as MapListView;
  for (const map of list.maps) {
    const entities = host.store.query("map-entities", { mapId: map.id });
    if (entities.ok) {
      // The `map-entities` query returns exactly a MapEntitiesView.
      // eslint-disable-next-line no-restricted-syntax -- JSON to the documented view type of the query name
      const view = entities.data as unknown as MapEntitiesView;
      const found = view.entities.find((entity) => entity.id === entityId);
      if (found !== undefined) {
        return { mapId: map.id, cell: found.cell, entityId };
      }
    }
  }
  return null;
}

function zoneLocation(host: EngineHost, zoneId: number): SubjectLocation | null {
  const zones = host.store.query("zones", {});
  if (!zones.ok) {
    return null;
  }
  // The `zones` query returns a list of ZoneView.
  // eslint-disable-next-line no-restricted-syntax -- JSON to the documented view type of the query name
  const rows = zones.data as unknown as readonly ZoneView[];
  const zone = rows.find((row) => row.id === zoneId);
  const tile = zone?.tiles[0];
  return zone === undefined || tile === undefined
    ? null
    : { mapId: zone.mapId, cell: tile, entityId: null };
}

function locateOne(host: EngineHost, kind: string, id: number): SubjectLocation | null {
  return kind === zoneKind ? zoneLocation(host, id) : entityLocation(host, id);
}

/**
 * Finds where a status subject is on the map. Subjects that are entities (citizens, workstations,
 * boards, sites, piles, dwellings) are looked up directly; zones by their first tile; postings
 * and orders have no place, so the places their reasons name are tried (the workstation, board or
 * cause behind them).
 *
 * @param host - The engine host.
 * @param subject - The subject.
 * @param reasons - Its reasons, for subjects without a place of their own.
 * @returns The location, or null when nothing it points at is on a map.
 */
export function locateSubject(
  host: EngineHost,
  subject: SubjectRef,
  reasons: readonly ReasonLike[] = [],
): SubjectLocation | null {
  const own = ["JobPosting", "ProductionOrder", "StandingOrder"].includes(subject.kind)
    ? null
    : locateOne(host, subject.kind, subject.id);
  if (own !== null) {
    return own;
  }
  for (const reason of reasons) {
    if (reason.causeRef !== null) {
      const caused = locateOne(host, reason.causeRef.kind, reason.causeRef.id);
      if (caused !== null) {
        return caused;
      }
    }
    for (const name of paramsNamingAnEntity) {
      const value = reason.params[name];
      const found = typeof value === "number" ? entityLocation(host, value) : null;
      if (found !== null) {
        return found;
      }
    }
    const zoneId = reason.params["zoneId"];
    const zone = typeof zoneId === "number" ? zoneLocation(host, zoneId) : null;
    if (zone !== null) {
      return zone;
    }
  }
  return null;
}

/**
 * Selects a subject and asks the camera to centre on it, then shows the map. When the subject has
 * no place on a map nothing happens.
 *
 * @param host - The engine host.
 * @param subject - The subject.
 * @param reasons - Its reasons, for subjects without a place of their own.
 * @returns Whether the camera was asked to move.
 */
export function focusSubject(
  host: EngineHost,
  subject: SubjectRef,
  reasons: readonly ReasonLike[] = [],
): boolean {
  const location = locateSubject(host, subject, reasons);
  if (location === null) {
    return false;
  }
  focusLocation(host, location);
  return true;
}

/**
 * Selects a location and asks the camera to centre on it, then shows the map.
 *
 * @param host - The engine host.
 * @param location - Where to go.
 */
export function focusLocation(host: EngineHost, location: SubjectLocation): void {
  host.selection.requestFocus(location.mapId, location.cell);
  if (location.entityId === null) {
    host.selection.selectCell(location.cell);
  } else {
    host.selection.selectEntity(location.entityId, location.cell);
  }
  host.navigation.navigate(Screen.Map);
}

/**
 * Focuses a citizen (or any entity) by id.
 *
 * @param host - The engine host.
 * @param entityId - The entity.
 * @returns Whether it stands on a map.
 */
export function focusEntity(host: EngineHost, entityId: number): boolean {
  const location = entityLocation(host, entityId);
  if (location === null) {
    return false;
  }
  focusLocation(host, location);
  return true;
}
