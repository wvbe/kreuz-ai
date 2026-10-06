import { z } from "zod";
import type { JsonValue } from "../../game/engine/EventBus";

const animalsSchema = z.object({
  animals: z.array(
    z.object({
      entityId: z.number(),
      prototypeId: z.string(),
      kind: z.string(),
      mapId: z.number().nullable(),
      cellIndex: z.number().nullable(),
      hungerMilli: z.number(),
      healthMilli: z.number(),
      held: z.array(z.object({ materialId: z.string(), quantity: z.number() })),
      action: z.string(),
    }),
  ),
});

/**
 * Formats the `animals` query for the `animals` verb: a summary line and one line per animal with
 * its id, species, kind, cell, health, hunger, what it holds and what it is doing.
 *
 * @param view - Data of the `animals` query.
 * @returns Output lines; a note when there are no animals, empty when the view is foreign.
 */
export function formatAnimals(view: JsonValue): string[] {
  const parsed = animalsSchema.safeParse(view);
  if (!parsed.success) {
    return [];
  }
  const { animals } = parsed.data;
  if (animals.length === 0) {
    return ["no animals"];
  }
  const wild = animals.filter((animal) => animal.kind === "wild").length;
  const lines = [`${animals.length} animals: ${wild} wild, ${animals.length - wild} livestock`];
  for (const animal of animals) {
    const place = animal.mapId === null ? "off the map" : `${animal.mapId}:${animal.cellIndex}`;
    const held = animal.held.map((item) => `${item.quantity} ${item.materialId}`).join(", ");
    lines.push(
      `  #${animal.entityId} ${animal.prototypeId} (${animal.kind}) at ${place}, health ${Math.floor(animal.healthMilli / 1000)}%, hunger ${Math.floor(animal.hungerMilli / 1000)}%${held === "" ? "" : `, holds ${held}`}: ${animal.action}`,
    );
  }
  return lines;
}
