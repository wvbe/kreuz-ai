import type { ContentKind } from "../../../game/api/contentQueries";
import type { EngineHost } from "../engine/EngineHost";
import { Screen } from "../navigation/Screen";

/**
 * An entry of the content browser to show first.
 */
export type ContentRequest = { kind: ContentKind; id: string };

let requested: ContentRequest | null = null;

/**
 * Hands over the entry the last {@link openContentEntry} asked for, once.
 *
 * @returns The request, or null when nobody asked since the last call.
 */
export function takeContentRequest(): ContentRequest | null {
  const request = requested;
  requested = null;
  return request;
}

/**
 * Opens the content browser on one entry (spec 024 FR-019 and FR-027: material and recipe names
 * of other screens link to it).
 *
 * @param host - The engine host (for navigation).
 * @param kind - The content category of the entry.
 * @param id - The entry id.
 */
export function openContentEntry(host: EngineHost, kind: ContentKind, id: string): void {
  requested = { kind, id };
  host.navigation.navigate(Screen.Content);
}
