import type { EntityId } from "../../ecs/Entity";
import type { NeedContent } from "../../content/schemas/characterSchemas";
import type { GameEngine } from "../../engine/GameEngine";
import type { Entity } from "../../ecs/Entity";

/**
 * How a need is satisfied by a plan.
 */
export enum NeedPlanKind {
  /**
   * Take an item out of an inventory (own or a source's) and consume it.
   */
  Consume = "consume",
  /**
   * Sleep where the plan says: in a bed, or on the ground.
   */
  Sleep = "sleep",
}

/**
 * A concrete way to satisfy one need now: plain JSON, stored in the `ai.satisfy` task so a save
 * resumes it.
 */
export type NeedPlan = {
  kind: NeedPlanKind;
  needId: string;
  /**
   * `Consume`: the entity whose inventory holds the item (the settler itself for inventory-first
   * plans). `Sleep`: the bed entity, or null for sleeping on the ground.
   */
  sourceId: EntityId | null;
  /**
   * `Consume`: the item to consume. `Sleep`: null.
   */
  materialId: string | null;
  /**
   * Where the settler has to stand for the action (its own cell for inventory plans).
   */
  mapId: number;
  cellIndex: number;
  /**
   * Milli-percent given per consumed item (`Consume`) or per sleeping tick (`Sleep`), before the
   * entity's trait bonuses; ground sleep is already reduced by `groundSleepRate`.
   */
  amountMilli: number;
};

/**
 * One authored way to satisfy a need (an entry of `satisfactionMethods`).
 */
export type NeedMethod = NeedContent["satisfactionMethods"][number];

/**
 * A pluggable source of need satisfaction (storage, stockpiles, markets, kitchens of later
 * tasks): asked after the settler's own inventory could not satisfy an `Item` method. It returns
 * a plan or null; plans are tried in registration order and the first one wins, so a finder
 * should return its nearest or best source. It must be a pure function of the game state.
 */
export type NeedSourceFinder = (
  engine: GameEngine,
  entity: Entity,
  need: NeedContent,
  method: NeedMethod,
) => NeedPlan | null;
