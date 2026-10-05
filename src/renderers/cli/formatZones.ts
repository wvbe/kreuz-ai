import { z } from "zod";
import type { JsonValue } from "../../game/engine/EventBus";

const gapSchema = z.object({
  kind: z.string(),
  requirement: z.string().nullable(),
  required: z.number().nullable(),
  present: z.number().nullable(),
});

const zoneSchema = z.object({
  id: z.number(),
  zoneTypeId: z.string(),
  mapId: z.number(),
  tiles: z.array(z.number()),
  isRoom: z.boolean(),
  active: z.boolean(),
  status: z.string(),
  gaps: z.array(gapSchema),
  filter: z
    .object({ categories: z.array(z.string()), materialIds: z.array(z.string()) })
    .nullable(),
  createdTick: z.number(),
  affinity: z.number(),
  workers: z.array(z.number()),
});

type Gap = z.infer<typeof gapSchema>;

function describeGap(gap: Gap): string {
  switch (gap.kind) {
    case "too-small":
      return `too small: ${gap.present ?? 0} of ${gap.required ?? 0} tiles`;
    case "not-enclosed":
      return "not enclosed by walls and doors";
    case "missing-furniture":
      return `missing furniture ${gap.requirement ?? "?"}: ${gap.present ?? 0} of ${gap.required ?? 0}`;
    case "missing-job-board":
      return "missing a job board";
    default:
      return gap.kind;
  }
}

function describeFilter(filter: { categories: string[]; materialIds: string[] } | null): string {
  if (filter === null) {
    return "accepts all";
  }
  return `accepts ${[...filter.categories, ...filter.materialIds].join(", ")}`;
}

/**
 * Formats the `zones` query for the `zones` verb: one line per zone with its type, map, status,
 * size and the first gap when it is not active.
 *
 * @param view - Data of the `zones` query.
 * @returns Output lines, empty when the view is not a zone list.
 */
export function formatZoneList(view: JsonValue): string[] {
  const parsed = z.array(zoneSchema).safeParse(view);
  if (!parsed.success) {
    return [];
  }
  if (parsed.data.length === 0) {
    return ["no zones"];
  }
  return parsed.data.map((zone) => {
    const first = zone.gaps[0];
    return `#${zone.id} ${zone.zoneTypeId} on map ${zone.mapId}: ${zone.status}, ${zone.tiles.length} tiles${zone.isRoom ? ", room" : ""}${first === undefined ? "" : ` (${describeGap(first)})`}`;
  });
}

/**
 * Formats one zone (query `zone`) for `zone <id>`: header, tiles, filter, workers with the
 * affinity bucket, and every gap.
 *
 * @param view - Data of the `zone` query.
 * @returns Output lines, empty when the view is not a zone.
 */
export function formatZone(view: JsonValue): string[] {
  const parsed = zoneSchema.safeParse(view);
  if (!parsed.success) {
    return [];
  }
  const zone = parsed.data;
  return [
    `zone #${zone.id} ${zone.zoneTypeId} on map ${zone.mapId}: ${zone.status}${zone.isRoom ? " (room)" : ""}, created tick ${zone.createdTick}`,
    `  tiles (${zone.tiles.length}): ${zone.tiles.join(" ")}`,
    `  storage filter: ${describeFilter(zone.filter)}`,
    `  workers: ${zone.workers.length === 0 ? "none" : zone.workers.map((id) => `#${id}`).join(" ")} (affinity ${zone.affinity})`,
    ...(zone.gaps.length === 0
      ? ["  gaps: none"]
      : zone.gaps.map((gap) => `  gap: ${describeGap(gap)}`)),
  ];
}
