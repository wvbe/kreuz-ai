import { z } from "zod";
import { AnimalKind } from "../content/contentTypes";
import { defineComponent } from "../ecs/ComponentRegistry";
import { maxMeterMilli } from "../ai/aiTypes";

/**
 * Data of the `Animal` component.
 */
export type AnimalData = {
  /**
   * Id of the animal prototype record (`animal-prototypes.json`); the content of the animal
   * (diet, products, prey) is read from it.
   */
  prototypeId: string;
  kind: AnimalKind;
  /**
   * Hunger, milli-percent `0..100000`; it grows by `animalHungerPerTick` and falls while the
   * animal stands on a diet terrain. Animals do not starve (DECISIONS D-140).
   */
  hungerMilli: number;
  /**
   * Tick at which the next periodic product is due, 0 while not yet scheduled.
   */
  nextProductTick: number;
  /**
   * First tick at which the animal may attack again.
   */
  attackReadyTick: number;
};

/**
 * The `Animal` component (DECISIONS D-140): marks livestock and wild animals. Animals are not
 * citizens: they have no `Citizen`, `Identity`, `Needs` or `Mood`, so population, status, housing
 * and the chronicle ignore them; the query `animals` lists them.
 */
export const animalComponent = defineComponent<"Animal", AnimalData>(
  "Animal",
  z
    .object({
      prototypeId: z.string().min(1),
      kind: z.enum(AnimalKind),
      hungerMilli: z.number().int().min(0).max(maxMeterMilli),
      nextProductTick: z.number().int().min(0),
      attackReadyTick: z.number().int().min(0),
    })
    .strict(),
  () => ({
    prototypeId: "unknown",
    kind: AnimalKind.Wild,
    hungerMilli: 0,
    nextProductTick: 0,
    attackReadyTick: 0,
  }),
);
