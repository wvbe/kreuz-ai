import { z } from "zod";
import { defineComponent } from "../../ecs/ComponentRegistry";
import { maxRelationshipHistory, maxRelationships } from "../aiTypes";
import type { RelationshipsData } from "../aiTypes";

/**
 * Strict Zod schema of the serialized {@link RelationshipsData}: at most {@link maxRelationships}
 * entries ascending and unique by `otherId`, each with at most {@link maxRelationshipHistory}
 * history records.
 */
export const relationshipsDataSchema = z
  .object({
    entries: z
      .array(
        z
          .object({
            otherId: z.number().int().min(1),
            affinityMilli: z.number().int().min(-100_000).max(100_000),
            lastTick: z.number().int().min(0),
            history: z
              .array(
                z
                  .object({
                    kind: z.string().min(1),
                    deltaMilli: z.number().int(),
                    tick: z.number().int().min(0),
                  })
                  .strict(),
              )
              .max(maxRelationshipHistory),
          })
          .strict(),
      )
      .max(maxRelationships),
  })
  .strict()
  .refine(
    (data) =>
      data.entries.every(
        (entry, index) => index === 0 || (data.entries[index - 1]?.otherId ?? 0) < entry.otherId,
      ),
    { message: "relationship entries must be unique and ascending by otherId" },
  );

/**
 * The `Relationships` component (spec 013 FR-006/007, DECISIONS D-25): what an entity feels about
 * others. Minimal for now: the data model, persistence and the summary the decision context reads
 * exist; the writers (gifts, conflicts, decay) come with the tasks that cause them. Default: none.
 */
export const relationshipsComponent = defineComponent<"Relationships", RelationshipsData>(
  "Relationships",
  relationshipsDataSchema,
  () => ({ entries: [] }),
);
