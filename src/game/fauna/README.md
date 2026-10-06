# src/game/fauna

Animals (spec 022 US11, plan task 5.3 part 2b, DECISIONS D-140): livestock and wild animals that live next to the settlers. The engine registers all of it for itself (`registerFauna` in the `GameEngine` constructor, after `registerChronicle`).

An animal is an entity with `Position`, `Inventory` (room for its products), `TaskQueue`, `AiState` (its behavior tree), `Health` and `Animal` (`animalPrototypeDefinition` in `../content` builds the prototype from `animal-prototypes.json`). It has no `Citizen`, `Identity`, `Needs` or `Mood`, so population, status, housing and the chronicle never see it; the query `animals {kind?, prototypeId?}` and the CLI verb `animals` list it, `entities` and `map` show it like any entity.

- `faunaTypes.ts` - ids, streams (`world.fauna`, `fauna.move`, `fauna.hunt`; animals never touch the AI streams of the settlers), task priorities, the constants (hunger, radii, flee, attack numbers), the events `animal.died` and `animal.product.ready`.
- `animalComponent.ts` - the `Animal` component `{prototypeId, kind, hungerMilli, nextProductTick, attackReadyTick}`.
- `animalSenses.ts` - `senseNearest` (nearest entity within a path-cost radius, deterministic), `isHumanoid`, `isGuard`, `isPredator`, `isPreyOf`, `matchesSense`, `animalContentOf`.
- `animalMovement.ts` - `wanderAnimal`, `grazeAnimal`, `fleeAnimal`, `pickFleeCell`, `enqueueMove` / `enqueueStand`: the animal versions of idle wander, using only `fauna.move`.
- `animalLifecycle.ts` - `removeAnimal` (event plus deletion), `damageHealth`, the attack cooldown.
- `animalHandlers.ts` - the behavior conditions and actions the animal trees name: `animal_hungry`, `threat_near`, `humanoid_near`, `prey_near`, `no_guard_near`, `animal_aggressive`, `hunt_urge`, `flee_from_threat`, `graze`, `wander_animal`, `stalk_prey`, `attack_prey`, `steal_prey`, `attack_intruder`.
- `runFaunaTick.ts` - the slot-4 system `fauna.tick`: hunger grows (falls on the diet terrain), the periodic product (wool, milk, eggs) goes into the animal's own inventory every `productIntervalTicks`.
- `animalJobs.ts` - the executors of `tend.animals` (take the products of a livestock animal), `butcher.animal` (livestock: drops and held products to the worker, the animal leaves) and `hunt.game` (wild: same, after a chase). The worker walks to where the animal is and walks again when it has moved, at most `maxChaseLegs` times.
- `animalViews.ts` - the `animals` view.
- `registerFauna.ts` - `registerFauna(engine)`: the component, the handlers, the executors, the systems, the AI wake check (`animalWakesForThreat`) and the new-game placement of wild animals.

## Rules of the model

- Wild animals are placed at the end of the new-game init (`../worldgen/spawnFauna.ts`), so no id of the starting world changes; entities created later (zones, sites, traders) have ids 7 higher than before the animals existed.
- A wild animal that sees a humanoid within its flee radius runs about four cells away and freezes eight ticks (`fleeAnimal`); settlers and animals walk at the same speed, so a hunter closes in during the freeze. A busy animal is woken by the AI (`AiService.registerWakeCheck`) every fourth tick when a threat is near.
- Livestock flee from predators (threat level 2 or more) only. Predators go for prey of their record (`preyIds`) within detection range when no guard is near, with the roll `predatorHuntChance` per decision; an attack takes a quarter of the prey's health, prey at zero health is removed (`animal.died`, cause `predation`). A fox takes a chicken at once (`stolen`).
- Aggressive animals (boar, bear) walk to a humanoid within detection range and hurt it (8 percent of health per attack, every 12 ticks, never below 1 percent: there is no combat system, so an attack cannot kill). A guard (`guard_patrol`, `../roles`) strikes a predator in reach.
- Animals never starve and do not breed (spec 022: breeding is out of scope). Livestock is not spawned at a new game; it arrives by trade later. There is no pasture zone in the pack yet, so livestock wanders over its diet terrain.
