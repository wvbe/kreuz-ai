/**
 * MapLink: Manages parent/sub-map relationships.
 * Tracks entrance cells for navigation between maps.
 */

export type MapLink = {
  parentMapId: string;
  childMapId: string;
  parentEntranceCellId: number;
  childEntranceCellId: number;
  label: string;
};

export type MapRegistry = {
  links: MapLink[];
};

/**
 * Creates a new map registry for tracking links.
 */
export function createMapRegistry(): MapRegistry {
  return { links: [] };
}

/**
 * Registers a link between a parent map and a child sub-map.
 */
export function addMapLink(
  registry: MapRegistry,
  parentMapId: string,
  childMapId: string,
  parentEntranceCellId: number,
  childEntranceCellId: number,
  label: string,
): void {
  registry.links.push({
    parentMapId,
    childMapId,
    parentEntranceCellId,
    childEntranceCellId,
    label,
  });
}

/**
 * Gets all sub-maps linked from a parent map.
 */
export function getChildMaps(registry: MapRegistry, parentMapId: string): MapLink[] {
  return registry.links.filter((link) => link.parentMapId === parentMapId);
}

/**
 * Gets the parent link for a child map.
 */
export function getParentLink(registry: MapRegistry, childMapId: string): MapLink | undefined {
  return registry.links.find((link) => link.childMapId === childMapId);
}
