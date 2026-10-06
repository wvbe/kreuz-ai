import { z } from "zod";
import { NotableMomentKind } from "../content/contentTypes";
import { MomentProminence, prominenceOfKind } from "./chronicleTypes";

/**
 * Strict Zod schema of a serialized `MomentRecord`, shared by the journal of the `Identity`
 * component and the `SettlementChronicle` component. The prominence must be the fixed one of the
 * kind (spec 028 FR-012).
 */
export const momentRecordSchema = z
  .object({
    momentId: z.number().int().min(1),
    tick: z.number().int().min(0),
    kind: z.enum(NotableMomentKind),
    prominence: z.enum(MomentProminence),
    entityId: z.number().int().min(1).nullable(),
    nameSnapshot: z.string().nullable(),
    params: z.record(z.string(), z.union([z.string(), z.number().int()])),
  })
  .strict()
  .refine((record) => record.prominence === prominenceOfKind[record.kind], {
    message: "prominence does not match the kind",
  });
