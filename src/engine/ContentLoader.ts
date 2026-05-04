import { Registry } from './Registry.js';

export interface ContentValidationError {
  registry: string;
  entryId?: string;
  field?: string;
  message: string;
  referencedId?: string;
  referencedRegistry?: string;
}

export interface ContentValidationWarning {
  registry: string;
  entryId?: string;
  message: string;
}

export interface ContentLoadResult {
  success: boolean;
  errors: ContentValidationError[];
  warnings: ContentValidationWarning[];
}

/**
 * Top-level orchestrator that loads all registries and validates cross-references.
 * Full implementation wired in Phase 6 when all registries are available.
 */
export class ContentLoader {
  /**
   * Load all content registries from data files.
   * Validates internal consistency and cross-references.
   */
  loadAllContent(): ContentLoadResult {
    const errors: ContentValidationError[] = [];
    const warnings: ContentValidationWarning[] = [];

    // Phase 6 will wire up full loading and cross-validation here.
    // For now, this is a structural placeholder.

    return {
      success: errors.length === 0,
      errors,
      warnings,
    };
  }
}
