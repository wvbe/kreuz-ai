import { z } from "zod";
import { defineComponent } from "../ecs/ComponentRegistry";
import { InventoryOperation, PermissionTargetKind, PermissionType } from "./inventoryTypes";
import type { InventoryData } from "./inventoryTypes";

const contentId = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
const entityIdSchema = z.number().int().min(1);

const slotSchema = z
  .object({
    materialId: z.string().regex(contentId),
    quantity: z.number().int().min(1),
    remainingMilli: z.number().int().min(1).nullable(),
    decayRateMilli: z.number().int().min(0).nullable(),
  })
  .strict()
  .refine((slot) => (slot.remainingMilli === null) === (slot.decayRateMilli === null), {
    message: "remainingMilli and decayRateMilli are both set (perishable) or both null",
  });

const targetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal(PermissionTargetKind.Entity), entityId: entityIdSchema }).strict(),
  z
    .object({ kind: z.literal(PermissionTargetKind.Faction), factionId: z.number().int().min(0) })
    .strict(),
  z.object({ kind: z.literal(PermissionTargetKind.Role), role: z.string().min(1) }).strict(),
  z.object({ kind: z.literal(PermissionTargetKind.Anyone) }).strict(),
]);

/**
 * Strict Zod schema of the serialized {@link InventoryData}: equipment names are unique and the
 * number of occupied slots may exceed `slotCount` (a reduced capacity keeps its contents).
 */
export const inventoryDataSchema = z
  .object({
    slotCount: z.number().int().min(0),
    weightLimitMilli: z.number().int().min(0).nullable(),
    ownerId: entityIdSchema.nullable(),
    queryable: z.boolean(),
    slots: z.array(slotSchema),
    equipment: z.array(
      z
        .object({
          name: z.string().min(1),
          restrictionCategory: z.string().regex(contentId),
          materialId: z.string().regex(contentId).nullable(),
        })
        .strict(),
    ),
    rules: z.array(
      z
        .object({
          type: z.enum(PermissionType),
          target: targetSchema,
          operation: z.enum(InventoryOperation),
        })
        .strict(),
    ),
  })
  .strict()
  .refine(
    (data) => new Set(data.equipment.map((slot) => slot.name)).size === data.equipment.length,
    { message: "equipment slot names must be unique" },
  );

/**
 * The `Inventory` component (spec 005 FR-001, DECISIONS D-07). Defaults: 8 slots, no weight
 * limit, no owner, queryable, empty, open access.
 */
export const inventoryComponent = defineComponent<"Inventory", InventoryData>(
  "Inventory",
  inventoryDataSchema,
  () => ({
    slotCount: 8,
    weightLimitMilli: null,
    ownerId: null,
    queryable: true,
    slots: [],
    equipment: [],
    rules: [],
  }),
);
