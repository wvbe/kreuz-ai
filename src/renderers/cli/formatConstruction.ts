import { z } from "zod";
import type { JsonValue } from "../../game/engine/EventBus";

const materialSchema = z.object({ materialId: z.string(), quantity: z.number() });

const reasonSchema = z.object({
  kind: z.string(),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

const siteSchema = z.object({
  jobId: z.number(),
  kind: z.string(),
  prototypeId: z.string(),
  status: z.string(),
  mapId: z.number(),
  cellIndex: z.number(),
  required: z.array(materialSchema),
  delivered: z.array(materialSchema),
  progress: z.number(),
  durationTicks: z.number(),
  builderId: z.number().nullable(),
  supplierId: z.number().nullable(),
  priority: z.number(),
  urgent: z.boolean(),
  paused: z.boolean(),
  targetEntityId: z.number().nullable(),
  blockers: z.array(reasonSchema),
});

const queueSchema = z.object({
  jobs: z.array(siteSchema),
  recent: z.array(
    z.object({
      jobId: z.number(),
      kind: z.string(),
      prototypeId: z.string(),
      status: z.string(),
      mapId: z.number(),
      cellIndex: z.number(),
      finishedTick: z.number(),
    }),
  ),
});

const placementSchema = z.object({
  valid: z.boolean(),
  prototypeId: z.string(),
  mapId: z.number(),
  cellIndex: z.number(),
  reasons: z.array(z.object({ kind: z.string(), text: z.string() })),
  zoneId: z.number().nullable(),
});

const menuSchema = z.array(
  z.object({
    id: z.string(),
    materials: z.array(materialSchema),
    constructionTicks: z.number(),
    locked: z.boolean(),
    unlockText: z.string().nullable(),
  }),
);

type Site = z.infer<typeof siteSchema>;

function describeSite(site: Site): string {
  const materials =
    site.required.length === 0
      ? ""
      : `, ${site.required
          .map((item) => {
            const delivered = site.delivered.find((entry) => entry.materialId === item.materialId);
            return `${item.materialId} ${delivered?.quantity ?? 0}/${item.quantity}`;
          })
          .join(" ")}`;
  const work =
    site.builderId === null ? "" : `, ${site.progress}/${site.durationTicks} by #${site.builderId}`;
  const supplier = site.supplierId === null ? "" : `, supplier #${site.supplierId}`;
  const flags = `${site.urgent ? ", urgent" : ""}${site.paused ? ", paused" : ""}`;
  const target = site.targetEntityId === null ? "" : ` of #${site.targetEntityId}`;
  return `#${site.jobId} ${site.kind} ${site.prototypeId}${target} at ${site.mapId}:${site.cellIndex}: ${site.status}, priority ${site.priority}${flags}${materials}${work}${supplier}`;
}

/**
 * Formats the `construction-queue` query for the `sites` verb: one line per live job (status,
 * priority, delivered/required materials, progress and builder) followed by its blocked reasons,
 * then the jobs that finished lately.
 *
 * @param view - Data of the `construction-queue` query.
 * @returns Output lines; a note when nothing is queued, empty when the view is not a queue.
 */
export function formatSites(view: JsonValue): string[] {
  const parsed = queueSchema.safeParse(view);
  if (!parsed.success) {
    return [];
  }
  const { jobs, recent } = parsed.data;
  if (jobs.length === 0 && recent.length === 0) {
    return ["no construction jobs"];
  }
  return [
    ...jobs.flatMap((site) => [
      describeSite(site),
      ...site.blockers.map(
        (reason) =>
          `    blocked: ${[
            reason.kind,
            ...Object.entries(reason.params).map(([name, value]) => `${name}=${String(value)}`),
          ].join(" ")}`,
      ),
    ]),
    ...recent.map(
      (job) =>
        `  finished #${job.jobId} ${job.kind} ${job.prototypeId} at ${job.mapId}:${job.cellIndex}: ${job.status} at tick ${job.finishedTick}`,
    ),
  ];
}

/**
 * Formats the answer of `validate-placement`.
 *
 * @param view - Data of the `validate-placement` query.
 * @returns One line, `ok` or the reasons; empty when the view is not a placement result.
 */
export function formatPlacement(view: JsonValue): string[] {
  const parsed = placementSchema.safeParse(view);
  if (!parsed.success) {
    return [];
  }
  const { prototypeId, mapId, cellIndex, zoneId } = parsed.data;
  const refusal = placementRefusal(view);
  const zone = zoneId === null ? "" : ` (zone #${zoneId})`;
  return [refusal ?? `${prototypeId} at ${mapId}:${cellIndex}: ok${zone}`];
}

/**
 * The reasons a placement is refused as one line.
 *
 * @param view - Data of the `validate-placement` query.
 * @returns For example `table at 1:20: Occupied (chest stands here)`, or null when the placement
 *   is valid or the view is not a placement result.
 */
export function placementRefusal(view: JsonValue): string | null {
  const parsed = placementSchema.safeParse(view);
  if (!parsed.success || parsed.data.valid) {
    return null;
  }
  const { prototypeId, mapId, cellIndex, reasons } = parsed.data;
  return `${prototypeId} at ${mapId}:${cellIndex}: ${reasons.map((reason) => `${reason.kind} (${reason.text})`).join(", ")}`;
}

/**
 * Formats the `build-menu` query: one line per definition with materials, work ticks and the
 * lock text.
 *
 * @param view - Data of the `build-menu` query.
 * @returns Output lines; empty when the view is not a menu.
 */
export function formatBuildMenu(view: JsonValue): string[] {
  const parsed = menuSchema.safeParse(view);
  if (!parsed.success) {
    return [];
  }
  return parsed.data.map((entry) => {
    const materials = entry.materials
      .map((item) => `${item.materialId} ${item.quantity}`)
      .join(", ");
    return `${entry.id}: ${materials}; ${entry.constructionTicks} ticks${entry.unlockText === null ? "" : ` [${entry.unlockText}]`}`;
  });
}
