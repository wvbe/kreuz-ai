import { getComponent } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { citizenComponent } from "../factions/citizenComponent";
import { dwellingComponent } from "./dwellingComponent";
import { clearHome, isEligibleResident } from "./household";

/**
 * Step 1 of the daily housing evaluation (spec 029 FR-006, DECISIONS D-28): clears the home of
 * every citizen whose home is no longer valid, with no event: the citizen is dead or being
 * deleted, left the player faction, is not an adult humanoid, or the dwelling is gone (it no
 * longer exists or no longer carries `Dwelling`). A dwelling that is only flagged for deletion
 * still counts: its zone events re-home or evict its residents in the same tick. Evictions for
 * capacity or a changed dwelling are announced by their own steps.
 *
 * @param engine - The engine.
 * @returns The ids of the citizens that lost their home, ascending.
 */
export function clearInvalidHomes(engine: GameEngine): number[] {
  const cleared: number[] = [];
  for (const entity of engine.store.entities()) {
    const home = getComponent(entity, citizenComponent)?.homeDwellingId ?? null;
    if (home === null) {
      continue;
    }
    const target = engine.store.get(home);
    if (
      !isEligibleResident(engine, entity) ||
      target === undefined ||
      getComponent(target, dwellingComponent) === undefined
    ) {
      clearHome(engine, entity.id);
      cleared.push(entity.id);
    }
  }
  return cleared;
}
