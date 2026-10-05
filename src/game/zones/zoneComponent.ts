import { z } from "zod";
import { defineComponent } from "../ecs/ComponentRegistry";
import { materialFilterSchema } from "../storage/stockpileComponent";
import { ZoneGapKind, ZoneStatus } from "./zoneTypes";
import type { ZoneData } from "./zoneTypes";

const zoneGapSchema = z
  .object({
    kind: z.enum(ZoneGapKind),
    requirement: z.string().min(1).nullable(),
    required: z.number().int().min(0).nullable(),
    present: z.number().int().min(0).nullable(),
  })
  .strict();

/**
 * Strict Zod schema of the serialized {@link ZoneData}.
 */
export const zoneDataSchema = z
  .object({
    zoneTypeId: z.string().regex(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/),
    mapId: z.number().int().min(0),
    tiles: z.array(z.number().int().min(0)),
    isRoom: z.boolean(),
    active: z.boolean(),
    status: z.enum(ZoneStatus),
    gaps: z.array(zoneGapSchema),
    filter: materialFilterSchema.nullable(),
    createdTick: z.number().int().min(0),
    activeSinceTick: z.number().int().min(0).nullable(),
  })
  .strict();

/**
 * The `Zone` component (spec 015, DECISIONS D-11): a typed set of cells on one map. The entity id
 * is the zone id. `isRoom`, `active`, `status` and `gaps` are derived by the zones system (slot 9)
 * and re-derived on load, so a save never decides them (FR-013).
 */
export const zoneComponent = defineComponent<"Zone", ZoneData>("Zone", zoneDataSchema, () => ({
  zoneTypeId: "stockpile",
  mapId: 0,
  tiles: [],
  isRoom: false,
  active: false,
  status: ZoneStatus.Inactive,
  gaps: [],
  filter: null,
  createdTick: 0,
  activeSinceTick: null,
}));
