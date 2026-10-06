/**
 * A short modern-English label for a `BlockedReasonKind` (spec 024 FR-025), used by the map
 * badges. The full per-kind template lines belong to the Idle and Blocked view (task 6.5); this
 * fallback turns any PascalCase kind into words so a new kind never shows blank.
 *
 * @param kind - The reason kind, for example `MissingInput`.
 * @returns Words, for example `Missing input`.
 */
export function blockedLabel(kind: string): string {
  const words = kind.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.length === 0 ? "Blocked" : words.charAt(0).toUpperCase() + words.slice(1);
}
