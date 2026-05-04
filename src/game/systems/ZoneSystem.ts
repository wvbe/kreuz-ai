/**
 * Zone system: zone creation, type assignment, activation lifecycle.
 */

export enum ZoneStatus {
  Incomplete = "incomplete",
  Active = "active",
  Paused = "paused",
}

export type Zone = {
  zoneId: string;
  zoneType: string;
  name: string;
  cellIds: number[];
  mapId: string;
  status: ZoneStatus;
  requiredFurniture: string[];
  placedFurniture: string[];
};

export type ZoneSystem = {
  zones: Map<string, Zone>;
};

/**
 * Creates a new zone system.
 */
export function createZoneSystem(): ZoneSystem {
  return { zones: new Map() };
}

/**
 * Creates a new zone.
 */
export function createZone(
  system: ZoneSystem,
  zoneId: string,
  zoneType: string,
  name: string,
  cellIds: number[],
  mapId: string,
  requiredFurniture: string[] = [],
): Zone {
  const zone: Zone = {
    zoneId,
    zoneType,
    name,
    cellIds,
    mapId,
    status: ZoneStatus.Incomplete,
    requiredFurniture,
    placedFurniture: [],
  };
  system.zones.set(zoneId, zone);
  return zone;
}

/**
 * Places furniture in a zone and checks if it should activate.
 */
export function placeFurnitureInZone(zone: Zone, furnitureType: string): void {
  zone.placedFurniture.push(furnitureType);
  checkActivation(zone);
}

/**
 * Checks if a zone should become active.
 */
function checkActivation(zone: Zone): void {
  if (zone.status !== ZoneStatus.Incomplete) return;
  const allPlaced = zone.requiredFurniture.every((req) => zone.placedFurniture.includes(req));
  if (allPlaced) {
    zone.status = ZoneStatus.Active;
  }
}

/**
 * Pauses an active zone.
 */
export function pauseZone(zone: Zone): void {
  if (zone.status === ZoneStatus.Active) {
    zone.status = ZoneStatus.Paused;
  }
}

/**
 * Resumes a paused zone.
 */
export function resumeZone(zone: Zone): void {
  if (zone.status === ZoneStatus.Paused) {
    zone.status = ZoneStatus.Active;
  }
}
