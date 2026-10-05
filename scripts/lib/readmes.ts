import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Finds every directory under `root` (including `root` itself) that has no README.md.
 * Implements spec 023 FR-016.
 *
 * @param root - Absolute or relative path of the folder to scan, normally `src`.
 * @returns Paths of the folders lacking a README.md, relative to `root`'s parent, sorted.
 */
export function findMissingReadmes(root: string): string[] {
  const missing: string[] = [];
  const base = join(root, "..");
  const visit = (dir: string): void => {
    if (!existsSync(join(dir, "README.md"))) {
      missing.push(relative(base, dir));
    }
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        visit(full);
      }
    }
  };
  visit(root);
  return missing;
}
