/**
 * Construction system: build queue, placement validation, material consumption, progress.
 */

import type { EntityManager, EntityId } from "../engine/EntityManager";
import { hasEnough, removeItem } from "./InventorySystem";

export enum ConstructionStatus {
  Queued = "queued",
  InProgress = "in_progress",
  Completed = "completed",
  Cancelled = "cancelled",
}

export type MaterialRequirement = {
  materialId: string;
  quantity: number;
};

export type ConstructionProject = {
  projectId: string;
  furnitureType: string;
  targetCellId: number;
  targetMapId: string;
  status: ConstructionStatus;
  materials: MaterialRequirement[];
  materialsDelivered: Map<string, number>;
  workRequired: number;
  workDone: number;
};

export type ConstructionSystem = {
  projects: ConstructionProject[];
};

/**
 * Creates a new construction system.
 */
export function createConstructionSystem(): ConstructionSystem {
  return { projects: [] };
}

/**
 * Queues a new construction project.
 */
export function queueConstruction(
  system: ConstructionSystem,
  projectId: string,
  furnitureType: string,
  targetCellId: number,
  targetMapId: string,
  materials: MaterialRequirement[],
  workRequired: number,
): ConstructionProject {
  const project: ConstructionProject = {
    projectId,
    furnitureType,
    targetCellId,
    targetMapId,
    status: ConstructionStatus.Queued,
    materials,
    materialsDelivered: new Map(),
    workRequired,
    workDone: 0,
  };
  system.projects.push(project);
  return project;
}

/**
 * Delivers materials to a construction site from an entity's inventory.
 */
export function deliverMaterials(
  manager: EntityManager,
  entityId: EntityId,
  project: ConstructionProject,
  materialId: string,
  quantity: number,
): number {
  const required = project.materials.find((mat) => mat.materialId === materialId);
  if (!required) return 0;
  const delivered = project.materialsDelivered.get(materialId) ?? 0;
  const remaining = required.quantity - delivered;
  const toDeliver = Math.min(quantity, remaining);
  const removed = removeItem(manager, entityId, materialId, toDeliver);
  project.materialsDelivered.set(materialId, delivered + removed);
  return removed;
}

/**
 * Checks if all materials have been delivered.
 */
export function allMaterialsDelivered(project: ConstructionProject): boolean {
  return project.materials.every((req) => {
    const delivered = project.materialsDelivered.get(req.materialId) ?? 0;
    return delivered >= req.quantity;
  });
}

/**
 * Advances work on a construction project.
 */
export function workOnConstruction(project: ConstructionProject, workAmount: number): boolean {
  if (!allMaterialsDelivered(project)) return false;
  project.status = ConstructionStatus.InProgress;
  project.workDone += workAmount;
  if (project.workDone >= project.workRequired) {
    project.status = ConstructionStatus.Completed;
    return true;
  }
  return false;
}
