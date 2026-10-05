import type { EntityId } from "../ecs/Entity";
import type { EventBus } from "../engine/EventBus";
import type { MaterialRegistry } from "./MaterialRegistry";

/**
 * Whether a permission rule allows or forbids the operation (spec 005 FR-025).
 */
export enum PermissionType {
  Grant = "grant",
  Deny = "deny",
}

/**
 * Operations a permission rule can name. `Transfer` is an alias for `Store` and `Retrieve`
 * together (DECISIONS D-07); `Equip` covers `equip` and `unequip`.
 */
export enum InventoryOperation {
  Store = "store",
  Retrieve = "retrieve",
  Transfer = "transfer",
  Equip = "equip",
}

/**
 * Who a permission rule applies to.
 */
export enum PermissionTargetKind {
  Entity = "entity",
  Faction = "faction",
  Role = "role",
  Anyone = "anyone",
}

/**
 * Target of a {@link PermissionRule}: one entity, every member of a faction, every holder of a
 * role, or everybody. Faction and role membership is answered by the {@link ActorResolver}.
 */
export type PermissionTarget =
  | { kind: PermissionTargetKind.Entity; entityId: EntityId }
  | { kind: PermissionTargetKind.Faction; factionId: number }
  | { kind: PermissionTargetKind.Role; role: string }
  | { kind: PermissionTargetKind.Anyone };

/**
 * One access rule; the first rule that matches the actor and the operation decides.
 */
export type PermissionRule = {
  type: PermissionType;
  target: PermissionTarget;
  operation: InventoryOperation;
};

/**
 * One occupied general-storage slot. Perishable stacks carry `remainingMilli` (milli-ticks until
 * expiry) and `decayRateMilli` (1000 = normal); both are null for other materials. The stack
 * limit is not stored: the material registry is the source of truth (DECISIONS D-07).
 */
export type InventorySlot = {
  materialId: string;
  quantity: number;
  remainingMilli: number | null;
  decayRateMilli: number | null;
};

/**
 * A named equipment slot holding at most one item; `restrictionCategory` must be one of the
 * item's material categories.
 */
export type EquipmentSlot = {
  name: string;
  restrictionCategory: string;
  materialId: string | null;
};

/**
 * Data of the `Inventory` component. `slots` holds only occupied slots in creation order and
 * `slotCount` is the capacity; `weightLimitMilli` is null for weight-unrestricted inventories.
 * `queryable` is false for inventories that storage queries must skip (DECISIONS D-09).
 * `ownerId` is the owner entity, informational for permission rules and systems.
 */
export type InventoryData = {
  slotCount: number;
  weightLimitMilli: number | null;
  ownerId: EntityId | null;
  queryable: boolean;
  slots: InventorySlot[];
  equipment: EquipmentSlot[];
  rules: PermissionRule[];
};

/**
 * Answers faction and role membership for permission rules; supplied by the systems that own
 * those concepts. Without a resolver no faction or role target matches.
 */
export type ActorResolver = {
  isInFaction: (actor: EntityId, factionId: number) => boolean;
  hasRole: (actor: EntityId, role: string) => boolean;
};

/**
 * Everything a mutating inventory call needs besides the entity: the material registry, the
 * acting entity (`null` = system actor that bypasses permission rules, DECISIONS D-07), the bus
 * that receives events at call time, and the optional membership resolver.
 */
export type InventoryContext = {
  materials: MaterialRegistry;
  actor: EntityId | null;
  bus?: EventBus;
  resolver?: ActorResolver;
};

/**
 * A quantity of one material.
 */
export type ItemQuantity = {
  materialId: string;
  quantity: number;
};

/**
 * Result of `canStore`: whether the whole quantity fits and the most that would fit.
 */
export type CanStoreResult = {
  fits: boolean;
  maxFittable: number;
};

/**
 * Result of `canRetrieve`: whether the requested quantity is available and how much is held in
 * general storage.
 */
export type CanRetrieveResult = {
  available: boolean;
  quantity: number;
};

/**
 * Result of `storeUpTo`; `stored + remainder` equals the requested quantity.
 */
export type StoreUpToResult = {
  stored: number;
  remainder: number;
};

/**
 * Freshness carried by items in flight (transfers keep their remaining time). Null for
 * non-perishable materials.
 */
export type Freshness = {
  remainingMilli: number;
  decayRateMilli: number;
};

/**
 * Items taken from one stack, with the freshness they had.
 */
export type StackPortion = {
  materialId: string;
  quantity: number;
  freshness: Freshness | null;
};

/**
 * Multipliers (permille) applied to perishable decay for one entity and tick: the zone or
 * container modifier and the difficulty decay multiplier (DECISIONS D-07, spec 027 FR-015).
 */
export type DecayModifiers = {
  zoneModifierMilli: number;
  difficultyDecayMilli: number;
};
