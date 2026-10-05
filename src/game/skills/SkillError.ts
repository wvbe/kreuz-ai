/**
 * Categories of skill system failure.
 */
export enum SkillErrorKind {
  /**
   * A loaded entity names a skill or trait id that the content pack does not define
   * (spec 020 edge case, spec 022 FR-015).
   */
  DanglingReference = "dangling-reference",
  /**
   * A `skill.work.completed` payload names a skill the content pack does not define.
   */
  UnknownSkill = "unknown-skill",
}

/**
 * Failure of the skill and trait system; callers branch on `kind`.
 */
export class SkillError extends Error {
  /**
   * Creates a skill error.
   *
   * @param kind - Failure category.
   * @param message - Human readable description naming the offending entity and id.
   */
  constructor(
    public readonly kind: SkillErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "SkillError";
  }
}
