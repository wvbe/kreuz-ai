/**
 * Categories of production failure (the command errors of DECISIONS section 3.5).
 */
export enum ProductionErrorKind {
  /**
   * The workstation entity does not exist or is not a workstation (`UnknownEntity`).
   */
  UnknownEntity = "unknown-entity",
  /**
   * The recipe is not in the content pack (`UnknownRecipe`).
   */
  UnknownRecipe = "unknown-recipe",
  /**
   * The recipe is locked behind a settlement tier the settlement has not reached (`ContentLocked`).
   */
  ContentLocked = "content-locked",
  /**
   * The workstation cannot make the recipe (wrong tag), or no workstation can (`RecipeNotCompatible`).
   */
  RecipeNotCompatible = "recipe-not-compatible",
  /**
   * The production order does not exist (`UnknownOrder`).
   */
  UnknownOrder = "unknown-order",
  /**
   * The quantity or priority is out of range.
   */
  InvalidQuantity = "invalid-quantity",
}

/**
 * Failure of the production module; callers branch on `kind`.
 */
export class ProductionError extends Error {
  /**
   * Creates a production error.
   *
   * @param kind - Failure category.
   * @param message - Human readable description naming the offending order, recipe or entity.
   */
  constructor(
    public readonly kind: ProductionErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ProductionError";
  }
}
