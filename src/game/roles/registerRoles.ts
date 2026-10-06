import type { GameEngine } from "../engine/GameEngine";
import { registerGuardHandlers } from "./guardHandlers";
import { registerZoneVisitHandlers } from "./zoneVisitHandlers";

const registered = new WeakSet<GameEngine>();

/**
 * Registers the behavior handlers of the role trees of spec 022 US14 that are not part of another
 * system (once per engine; the engine does it for itself): `zone_available` and `go_to_zone`
 * (`merchant_routine`, `priest_routine`) and `hostile_animal_near` and `engage_threat`
 * (`guard_patrol`). The handlers of `daily_routine` and `worker_cycle` belong to the AI, job and
 * housing systems.
 *
 * @param engine - The engine; call before the first `newGame` / `loadGame`.
 */
export function registerRoles(engine: GameEngine): void {
  if (registered.has(engine)) {
    return;
  }
  registered.add(engine);
  registerZoneVisitHandlers(engine);
  registerGuardHandlers(engine);
}
