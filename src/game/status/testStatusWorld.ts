import { createConstructionWorld } from "../construction/testConstructionWorld";
import type { ConstructionTestWorld } from "../construction/testConstructionWorld";
import type { Entity } from "../ecs/Entity";
import type { JsonValue } from "../engine/EventBus";
import type { JobTestWorldOptions } from "../jobs/testJobWorld";
import { getStatusService } from "./statusServiceRegistry";
import { StatusSubjectKind } from "./statusTypes";
import type { StatusSubjectRef, SubjectStatus } from "./statusTypes";

/**
 * One `status.*` event seen by the test world.
 */
export type SeenStatusEvent = {
  tick: number;
  name: string;
  payload: JsonValue;
};

/**
 * A construction test world plus a synthetic status provider for the kind `StandingOrder` (it
 * replaces the real provider of task 4.3, which this world's tests do not use): the test decides
 * which synthetic subjects exist and what their status is, so the settle machinery can be tested
 * without a game.
 */
export type StatusTestWorld = ConstructionTestWorld & {
  /**
   * Sets (or replaces) the status of a synthetic subject; the subject appears in the list.
   */
  setSynthetic: (id: number, status: SubjectStatus) => StatusSubjectRef;
  /**
   * Removes a synthetic subject.
   */
  removeSynthetic: (id: number) => void;
  /**
   * Every `status.*` event seen so far.
   */
  statusEvents: SeenStatusEvent[];
  /**
   * Builds a working bakery room (an oven in a walled 2x2 room with a door, an active `bakery`
   * zone) and runs 3 ticks so the zone is active; no citizen is spawned.
   */
  bakery: () => { oven: Entity; zoneId: number };
};

/**
 * Builds a {@link StatusTestWorld}.
 *
 * @param options - Map size, difficulty, seed and board cell.
 * @returns The world.
 */
export function createStatusWorld(options: JobTestWorldOptions = {}): StatusTestWorld {
  const world = createConstructionWorld(options);
  const synthetic = new Map<number, SubjectStatus>();
  getStatusService(world.engine).replaceProvider({
    kind: StatusSubjectKind.StandingOrder,
    subjects: () =>
      [...synthetic.keys()].map((id) => ({ kind: StatusSubjectKind.StandingOrder, id })),
    evaluate: (_engine, ref) => synthetic.get(ref.id) ?? null,
  });
  const statusEvents: SeenStatusEvent[] = [];
  world.engine.bus.subscribe("status.*", (payload, event) => {
    statusEvents.push({ tick: world.engine.time.tickCount, name: event.name, payload });
  });
  return {
    ...world,
    statusEvents,
    setSynthetic: (id, status) => {
      synthetic.set(id, status);
      return { kind: StatusSubjectKind.StandingOrder, id };
    },
    removeSynthetic: (id) => {
      synthetic.delete(id);
    },
    bakery: () => {
      const cells = world.rect(2, 2, 2, 2);
      const oven = world.station("oven", cells[0] ?? 0);
      world.walls(2, 2, 2, 2, [31]);
      world.door(31);
      const [zoneId] = world.designate("bakery", cells);
      world.run(3);
      return { oven, zoneId: zoneId ?? 0 };
    },
  };
}
