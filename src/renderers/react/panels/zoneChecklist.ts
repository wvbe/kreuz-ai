import type { ContentEntryView } from "../../../game/api/contentQueries";
import type { ZoneView } from "../../../game/zones/zoneTypes";
import type { JsonValue } from "../../../game/engine/EventBus";
import type { ChecklistItem } from "../ui/Checklist";
import { humanizeId } from "./reasonText";

type Alternative = { kind: string; ref: string; count: number; perTiles?: number };

function isAlternative(value: JsonValue): value is Alternative {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value["kind"] === "string" &&
    typeof value["ref"] === "string" &&
    typeof value["count"] === "number"
  );
}

function groupsOf(value: JsonValue | undefined): Alternative[][] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((group) => (Array.isArray(group) ? group.filter(isAlternative) : []));
}

/**
 * Builds the requirement checklist of a zone from its zone type's definition and the gaps the
 * zone reports: size, enclosure, furniture groups (alternatives joined with "or") and the job
 * board. An item is met when the zone reports no gap for it.
 *
 * @param zone - The `zone` view.
 * @param type - The `content-entry` view of the zone type.
 * @returns The checklist items in display order.
 */
export function zoneChecklist(zone: ZoneView, type: ContentEntryView): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const minTiles = type.fields["minTiles"];
  if (typeof minTiles === "number" && minTiles > 0) {
    const gap = zone.gaps.find((candidate) => candidate.kind === "too-small");
    items.push({
      label: `At least ${minTiles} tiles`,
      met: gap === undefined,
      detail: `${zone.tiles.length} of ${minTiles}`,
    });
  }
  if (type.fields["requiresRoom"] === true) {
    items.push({
      label: "Enclosed by walls and a door",
      met: !zone.gaps.some((gap) => gap.kind === "not-enclosed"),
    });
  }
  for (const group of groupsOf(type.fields["furnitureRequirements"])) {
    const text = group
      .map(
        (alternative) =>
          `${alternative.count}x ${alternative.kind}:${alternative.ref}${
            alternative.perTiles === undefined ? "" : ` per ${alternative.perTiles} tiles`
          }`,
      )
      .join(" or ");
    const gap = zone.gaps.find(
      (candidate) => candidate.kind === "missing-furniture" && candidate.requirement === text,
    );
    items.push({
      label: group
        .map(
          (alternative) =>
            `${alternative.count} ${humanizeId(alternative.ref)}${
              alternative.perTiles === undefined ? "" : ` per ${alternative.perTiles} tiles`
            }`,
        )
        .join(" or "),
      met: gap === undefined,
      ...(gap === undefined || gap.present === null || gap.required === null
        ? {}
        : { detail: `${gap.present} of ${gap.required}` }),
    });
  }
  if (type.fields["requiresJobBoard"] === true) {
    items.push({
      label: "A job board",
      met: !zone.gaps.some((gap) => gap.kind === "missing-job-board"),
    });
  }
  return items;
}
