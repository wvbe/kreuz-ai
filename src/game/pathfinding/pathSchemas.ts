import { z } from "zod";
import { NoPathReason, PathResultKind } from "./pathTypes";

const cellSchema = z.number().int().min(0);
const costSchema = z.number().int().min(0);

/**
 * Zod schema of {@link PathResult}, for stored task data and the `find-path` query.
 */
export const pathResultSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal(PathResultKind.Found),
      cells: z.array(cellSchema).min(1),
      cost: costSchema,
    })
    .strict(),
  z.object({ kind: z.literal(PathResultKind.AlreadyThere) }).strict(),
  z.object({ kind: z.literal(PathResultKind.NoPath), reason: z.enum(NoPathReason) }).strict(),
]);

/**
 * Zod schema of {@link RouteResult}.
 */
export const routeResultSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal(PathResultKind.Found),
      steps: z
        .array(z.object({ mapId: z.number().int().min(1), cellIndex: cellSchema }).strict())
        .min(1),
      cost: costSchema,
    })
    .strict(),
  z.object({ kind: z.literal(PathResultKind.AlreadyThere) }).strict(),
  z.object({ kind: z.literal(PathResultKind.NoPath), reason: z.enum(NoPathReason) }).strict(),
]);
