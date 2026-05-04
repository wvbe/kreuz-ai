/**
 * Faction system: faction creation, membership, disposition tracking, diplomacy.
 */

export enum Disposition {
  Hostile = "hostile",
  Unfriendly = "unfriendly",
  Neutral = "neutral",
  Friendly = "friendly",
  Allied = "allied",
}

export type Faction = {
  factionId: string;
  name: string;
  members: Set<number>;
  dispositions: Map<string, number>;
};

export type FactionSystem = {
  factions: Map<string, Faction>;
};

/**
 * Creates a new faction system.
 */
export function createFactionSystem(): FactionSystem {
  return { factions: new Map() };
}

/**
 * Creates a new faction.
 */
export function createFaction(system: FactionSystem, factionId: string, name: string): Faction {
  const faction: Faction = {
    factionId,
    name,
    members: new Set(),
    dispositions: new Map(),
  };
  system.factions.set(factionId, faction);
  return faction;
}

/**
 * Adds an entity to a faction.
 */
export function joinFaction(system: FactionSystem, factionId: string, entityId: number): void {
  const faction = system.factions.get(factionId);
  if (faction) {
    faction.members.add(entityId);
  }
}

/**
 * Removes an entity from a faction.
 */
export function leaveFaction(system: FactionSystem, factionId: string, entityId: number): void {
  const faction = system.factions.get(factionId);
  if (faction) {
    faction.members.delete(entityId);
  }
}

/**
 * Changes disposition between two factions.
 */
export function changeDisposition(
  system: FactionSystem,
  fromFactionId: string,
  toFactionId: string,
  delta: number,
): void {
  const faction = system.factions.get(fromFactionId);
  if (!faction) return;
  const current = faction.dispositions.get(toFactionId) ?? 0;
  faction.dispositions.set(toFactionId, Math.max(-100, Math.min(100, current + delta)));
}

/**
 * Gets the disposition label between two factions.
 */
export function getDisposition(
  system: FactionSystem,
  fromFactionId: string,
  toFactionId: string,
): Disposition {
  const faction = system.factions.get(fromFactionId);
  const value = faction?.dispositions.get(toFactionId) ?? 0;
  if (value <= -60) return Disposition.Hostile;
  if (value <= -20) return Disposition.Unfriendly;
  if (value <= 20) return Disposition.Neutral;
  if (value <= 60) return Disposition.Friendly;
  return Disposition.Allied;
}
