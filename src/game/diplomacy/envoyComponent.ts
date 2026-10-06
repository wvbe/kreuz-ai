import { z } from "zod";
import { defineComponent } from "../ecs/ComponentRegistry";
import {
  DeclarationKind,
  DiplomaticActType,
  DispatchFailureReason,
  EnvoyStatus,
} from "./diplomacyTypes";
import type { EnvoyData } from "./diplomacyTypes";

const idSchema = z.number().int().min(1);
const tickSchema = z.number().int().min(0);

/**
 * Strict Zod schema of the serialized {@link EnvoyData}.
 */
export const envoyDataSchema = z
  .object({
    senderFactionId: idSchema,
    targetFactionId: idSchema,
    actType: z.enum(DiplomaticActType),
    declaration: z.enum(DeclarationKind).nullable(),
    cargo: z.array(z.object({ materialId: z.string().min(1), quantity: idSchema }).strict()),
    giftValueCoins: tickSchema,
    creationTick: tickSchema,
    travelTicks: idSchema,
    arriveTick: tickSchema,
    deadlineTick: tickSchema,
    status: z.enum(EnvoyStatus),
    returnTick: tickSchema.nullable(),
    failure: z.enum(DispatchFailureReason).nullable(),
  })
  .strict();

/**
 * The `Envoy` component (spec 021 FR-004): carries one diplomatic act. The default is a neutral
 * placeholder record; `dispatchAct` always sets every field.
 */
export const envoyComponent = defineComponent<"Envoy", EnvoyData>("Envoy", envoyDataSchema, () => ({
  senderFactionId: 1,
  targetFactionId: 1,
  actType: DiplomaticActType.Overture,
  declaration: null,
  cargo: [],
  giftValueCoins: 0,
  creationTick: 0,
  travelTicks: 1,
  arriveTick: 0,
  deadlineTick: 0,
  status: EnvoyStatus.Traveling,
  returnTick: null,
  failure: null,
}));
