import { EcsError, EcsErrorKind } from "./EcsError";

/**
 * Which way a relationship is read relative to the component field that stores the reference.
 */
export enum RelationshipDirection {
  /**
   * The entity itself holds the reference: related ids are read from its own field.
   */
  Forward = "forward",
  /**
   * Other entities hold references to this entity: related ids are found by scanning for it.
   */
  Inverse = "inverse",
}

/**
 * A named relationship backed by an entity-id field (`number`, `number[]` or `null`) of a component.
 * Only the owning side stores the reference; the inverse is derived by scanning (spec 002,
 * DECISIONS E-02), so it cannot drift out of sync.
 */
export type RelationshipDefinition = {
  /**
   * Unique name used for lookups, e.g. `members` or `faction`.
   */
  name: string;
  /**
   * Component holding the reference field.
   */
  component: string;
  /**
   * Top-level field of that component with the referenced entity ids.
   */
  field: string;
  direction: RelationshipDirection;
  /**
   * True when a lookup can return more than one entity.
   */
  many: boolean;
};

/**
 * Input of {@link RelationshipRegistry.registerPair}.
 */
export type RelationshipPair = {
  /**
   * Name of the forward side, read from the holder's own field (e.g. `factions`).
   */
  forwardName: string;
  /**
   * Name of the derived side (e.g. `members`).
   */
  inverseName: string;
  component: string;
  field: string;
  /**
   * Whether the forward side can have several targets (the field is a list).
   */
  forwardMany: boolean;
  /**
   * Whether the inverse side can have several results; defaults to true.
   */
  inverseMany?: boolean;
};

/**
 * Per-engine registry of relationship definitions. Systems register the relationships they own.
 */
export class RelationshipRegistry {
  private readonly definitions = new Map<string, RelationshipDefinition>();

  /**
   * Adds one relationship.
   *
   * @param definition - The relationship to add; names are unique.
   */
  register(definition: RelationshipDefinition): void {
    if (definition.name.length === 0 || definition.field.length === 0) {
      throw new EcsError(
        EcsErrorKind.InvalidDefinition,
        "relationship name and field must not be empty",
      );
    }
    if (this.definitions.has(definition.name)) {
      throw new EcsError(
        EcsErrorKind.DuplicateDefinition,
        `relationship "${definition.name}" is already registered`,
      );
    }
    this.definitions.set(definition.name, { ...definition });
  }

  /**
   * Adds a forward relationship and its derived inverse in one call.
   *
   * @param pair - Names and shared component field.
   */
  registerPair(pair: RelationshipPair): void {
    this.register({
      name: pair.forwardName,
      component: pair.component,
      field: pair.field,
      direction: RelationshipDirection.Forward,
      many: pair.forwardMany,
    });
    this.register({
      name: pair.inverseName,
      component: pair.component,
      field: pair.field,
      direction: RelationshipDirection.Inverse,
      many: pair.inverseMany ?? true,
    });
  }

  /**
   * Looks up a relationship, throwing for unknown names.
   *
   * @param name - Relationship name.
   * @returns A copy of the definition.
   */
  require(name: string): RelationshipDefinition {
    const definition = this.definitions.get(name);
    if (!definition) {
      throw new EcsError(
        EcsErrorKind.UnknownRelationship,
        `relationship "${name}" is not registered`,
      );
    }
    return { ...definition };
  }

  /**
   * Tells whether a relationship name is registered.
   *
   * @param name - Relationship name.
   * @returns True when registered.
   */
  has(name: string): boolean {
    return this.definitions.has(name);
  }

  /**
   * Lists the forward relationships, whose fields hold references that must be cleared when their
   * target is deleted.
   *
   * @returns Forward definitions sorted by name.
   */
  forwardDefinitions(): RelationshipDefinition[] {
    return [...this.definitions.values()]
      .filter((definition) => definition.direction === RelationshipDirection.Forward)
      .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  }
}
