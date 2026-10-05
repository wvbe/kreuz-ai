import type { ContentIssue } from "./contentTypes";

/**
 * Formats one issue as `file [id] field: message`.
 *
 * @param issue - The issue.
 * @returns A single line naming file, id and field.
 */
export function formatContentIssue(issue: ContentIssue): string {
  const id = issue.id === null ? "" : ` [${issue.id}]`;
  const field = issue.field === "" ? "" : ` ${issue.field}`;
  return `${issue.file}${id}${field}: ${issue.message}`;
}

/**
 * Thrown when a content pack is invalid. All problems are collected in one pass (spec 022
 * FR-015) and listed in `issues`; the message has one line per issue.
 */
export class ContentValidationError extends Error {
  /**
   * Creates the error.
   *
   * @param issues - Every problem found, in validation order.
   */
  constructor(public readonly issues: readonly ContentIssue[]) {
    super(
      `content pack is invalid (${issues.length} problem${issues.length === 1 ? "" : "s"}):\n` +
        issues.map((issue) => `  ${formatContentIssue(issue)}`).join("\n"),
    );
    this.name = "ContentValidationError";
  }
}
