import { z } from "zod";
import { defineComponent } from "../ecs/ComponentRegistry";

/**
 * The `Position` component `{ mapId, cellIndex }` (DECISIONS D-05): the sole source of an
 * entity's location. Entities that are carried, stored or off-map simply have no Position. The
 * occupant index and cell queries are derived from it and rebuilt on load.
 */
export const positionComponent = defineComponent(
  "Position",
  z
    .object({
      mapId: z.number().int().min(1),
      cellIndex: z.number().int().min(0),
    })
    .strict(),
  () => ({ mapId: 1, cellIndex: 0 }),
);
