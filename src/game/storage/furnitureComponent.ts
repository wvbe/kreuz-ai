import { z } from "zod";
import { defineComponent } from "../ecs/ComponentRegistry";
import type { FurnitureData } from "./storageTypes";

/**
 * The `Furniture` component: marks an entity as a placed furniture piece of the content pack
 * (`furnitureId` names the `furniture.json` record, which holds tags, storage and effects).
 * Furniture entities are `Position` + `Furniture` (+ `Inventory` for storage pieces such as the
 * chest). It is deliberately minimal: zones and rooms (3.4) and construction (3.5) extend it.
 */
export const furnitureComponent = defineComponent<"Furniture", FurnitureData>(
  "Furniture",
  z
    .object({ furnitureId: z.string().regex(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/) })
    .strict(),
  () => ({ furnitureId: "chest" }),
);
