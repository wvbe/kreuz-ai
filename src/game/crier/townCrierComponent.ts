import { z } from "zod";
import { defineComponent } from "../ecs/ComponentRegistry";
import { CrierStatus } from "./crierTypes";
import type { TownCrierData } from "./crierTypes";

const idSchema = z.number().int().min(1);

/**
 * Strict Zod schema of the serialized {@link TownCrierData}.
 */
export const townCrierDataSchema = z
  .object({
    status: z.nativeEnum(CrierStatus),
    boardQueue: z.array(idSchema),
    carrying: z.array(idSchema),
  })
  .strict();

/**
 * The `TownCrier` component (DECISIONS D-12): a citizen with this component is part of the
 * colony's Town Crier fleet. Defaults to an available crier with nothing to deliver.
 */
export const townCrierComponent = defineComponent<"TownCrier", TownCrierData>(
  "TownCrier",
  townCrierDataSchema,
  () => ({ status: CrierStatus.Available, boardQueue: [], carrying: [] }),
);
