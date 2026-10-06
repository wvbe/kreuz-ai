import type { MapEntityView } from "../../../game/api/Views";

/**
 * The generated primitive an entity is drawn as (spec 024 FR-004, no external models).
 */
export enum VisualKind {
  Citizen = "citizen",
  Trader = "trader",
  Livestock = "livestock",
  WildAnimal = "wild-animal",
  NoticePost = "notice-post",
  Wall = "wall",
  Door = "door",
  BuildSite = "build-site",
  Furniture = "furniture",
  Marker = "marker",
}

/**
 * Component name the map screen adds to the `components` of a wild animal's row: the
 * `map-entities` view does not say livestock from wild, the `animals` query does (spec 024 FR-004).
 */
export const wildAnimalMarker = "renderer.wild";

/**
 * Every kind, in draw order.
 */
export const visualKinds: readonly VisualKind[] = Object.values(VisualKind);

/**
 * Decides how an entity is drawn from its prototype and its component names.
 *
 * @param entity - A row of the `map-entities` view.
 * @returns The visual kind; `Marker` for anything without a dedicated primitive.
 */
export function classifyEntity(entity: MapEntityView): VisualKind {
  if (entity.prototype === "wall") {
    return VisualKind.Wall;
  }
  if (entity.prototype === "door") {
    return VisualKind.Door;
  }
  if (entity.prototype === "build_site" || entity.components.includes("BuildSite")) {
    return VisualKind.BuildSite;
  }
  if (entity.components.includes("Trader")) {
    return VisualKind.Trader;
  }
  if (entity.components.includes("Needs") || entity.components.includes("Citizen")) {
    return VisualKind.Citizen;
  }
  if (entity.components.includes("Animal") || entity.components.includes("Livestock")) {
    return entity.components.includes(wildAnimalMarker)
      ? VisualKind.WildAnimal
      : VisualKind.Livestock;
  }
  if (entity.prototype === "notice_post") {
    return VisualKind.NoticePost;
  }
  if (entity.components.includes("Furniture")) {
    return VisualKind.Furniture;
  }
  return VisualKind.Marker;
}

/**
 * Base colour of a kind as 0xRRGGBB.
 *
 * @param kind - The visual kind.
 * @returns The colour.
 */
export function visualColor(kind: VisualKind): number {
  switch (kind) {
    case VisualKind.Citizen:
      return 0xf2d6a2;
    case VisualKind.Trader:
      return 0xd9a441;
    case VisualKind.Livestock:
      return 0xe8e4d8;
    case VisualKind.WildAnimal:
      return 0x8a6f4d;
    case VisualKind.NoticePost:
      return 0xd8c28a;
    case VisualKind.Wall:
      return 0xb8b2a6;
    case VisualKind.Door:
      return 0x8a5a2b;
    case VisualKind.BuildSite:
      return 0xc9b458;
    case VisualKind.Furniture:
      return 0xa9743c;
    case VisualKind.Marker:
      return 0xc23b3b;
  }
}

/**
 * Colour of an individual: citizens vary their tunic by prototype so a trade can be told apart
 * at a glance; everything else uses its kind colour.
 *
 * @param kind - The visual kind.
 * @param prototype - The entity prototype id.
 * @returns The colour.
 */
export function entityColor(kind: VisualKind, prototype: string): number {
  if (kind !== VisualKind.Citizen) {
    return visualColor(kind);
  }
  let hash = 0;
  for (const letter of prototype) {
    hash = (hash * 31 + letter.charCodeAt(0)) >>> 0;
  }
  const tunics = [0x4f7fc9, 0xc9704f, 0x6fb06a, 0xb06fc9, 0xc9b44f, 0x4fb0b0];
  return tunics[hash % tunics.length] ?? 0x4f7fc9;
}

/**
 * Height of a primitive in world units (how far a badge floats above it).
 *
 * @param kind - The visual kind.
 * @returns The height.
 */
export function visualHeight(kind: VisualKind): number {
  switch (kind) {
    case VisualKind.Citizen:
    case VisualKind.Trader:
      return 0.9;
    case VisualKind.Wall:
      return 1;
    case VisualKind.Door:
      return 0.9;
    case VisualKind.Livestock:
    case VisualKind.WildAnimal:
      return 0.5;
    case VisualKind.NoticePost:
      return 1.1;
    case VisualKind.Furniture:
      return 0.5;
    case VisualKind.BuildSite:
      return 0.3;
    case VisualKind.Marker:
      return 0.4;
  }
}
