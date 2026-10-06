import { BoxGeometry, ConeGeometry, CylinderGeometry, Matrix4, SphereGeometry } from "three";
import type { BufferGeometry } from "three";
// eslint-disable-next-line no-restricted-syntax -- the three.js package exports this module only with its .js extension
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { VisualKind } from "./entityVisuals";

function box(width: number, height: number, depth: number, x: number, y: number, z: number) {
  const geometry = new BoxGeometry(width, height, depth);
  geometry.applyMatrix4(new Matrix4().makeTranslation(x, y, z));
  return geometry;
}

function cylinder(radius: number, height: number, x: number, y: number, z: number) {
  const geometry = new CylinderGeometry(radius * 0.8, radius, height, 8);
  geometry.applyMatrix4(new Matrix4().makeTranslation(x, y, z));
  return geometry;
}

function ball(radius: number, x: number, y: number, z: number) {
  const geometry = new SphereGeometry(radius, 8, 6);
  geometry.applyMatrix4(new Matrix4().makeTranslation(x, y, z));
  return geometry;
}

function cone(radius: number, height: number, x: number, y: number, z: number) {
  const geometry = new ConeGeometry(radius, height, 6);
  geometry.applyMatrix4(new Matrix4().makeTranslation(x, y, z));
  return geometry;
}

/**
 * Builds the generated low-poly primitive of a visual kind (spec 024 FR-004; the GUI uses no
 * external models): a body made of a few boxes, cylinders and spheres merged into one geometry
 * so a kind is one instanced draw call. Its origin is the centre of the cell on the ground.
 *
 * @param kind - The visual kind.
 * @returns The merged geometry (the caller disposes it).
 */
export function createVisualGeometry(kind: VisualKind): BufferGeometry {
  const parts: BufferGeometry[] = (() => {
    switch (kind) {
      case VisualKind.Citizen:
        return [cylinder(0.16, 0.5, 0, 0.25, 0), ball(0.12, 0, 0.64, 0)];
      case VisualKind.Trader:
        return [
          cylinder(0.18, 0.5, 0, 0.25, 0),
          ball(0.12, 0, 0.64, 0),
          box(0.3, 0.3, 0.2, 0, 0.35, -0.2),
        ];
      case VisualKind.Livestock:
        return [box(0.5, 0.28, 0.26, 0, 0.28, 0), box(0.16, 0.16, 0.16, 0.32, 0.38, 0)];
      case VisualKind.Wall:
        return [box(0.96, 1, 0.96, 0, 0.5, 0)];
      case VisualKind.Door:
        return [box(0.12, 0.9, 0.7, 0, 0.45, 0), box(0.2, 0.08, 0.84, 0, 0.94, 0)];
      case VisualKind.BuildSite:
        return [
          box(0.8, 0.12, 0.8, 0, 0.06, 0),
          box(0.08, 0.5, 0.08, -0.36, 0.25, -0.36),
          box(0.08, 0.5, 0.08, 0.36, 0.25, 0.36),
        ];
      case VisualKind.Furniture:
        return [box(0.6, 0.36, 0.5, 0, 0.18, 0), box(0.64, 0.08, 0.54, 0, 0.4, 0)];
      case VisualKind.Marker:
        return [cone(0.2, 0.5, 0, 0.25, 0)];
    }
  })();
  const merged = mergeGeometries(parts, false);
  for (const part of parts) {
    part.dispose();
  }
  if (merged === null) {
    throw new Error(`could not merge the geometry of ${kind}`);
  }
  return merged;
}

/**
 * Builds the geometry of one crop plant (a small cone, unit height).
 *
 * @returns The geometry (the caller disposes it).
 */
export function createCropGeometry(): BufferGeometry {
  const geometry = new ConeGeometry(0.14, 1, 5);
  geometry.applyMatrix4(new Matrix4().makeTranslation(0, 0.5, 0));
  return geometry;
}
