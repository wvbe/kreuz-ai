import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

// Spec to test traceability (plan task 7.1, groundwork of 7.2): scans specs/*/spec.md for the
// requirement ids FR-xxx and SC-xxx and the tests for mentions of them, then prints the coverage
// per spec and writes docs/FR-COVERAGE.md. Not a CI gate yet.
//
// A test "covers" an id when the id appears in a test file (in a test name, a comment or an
// `@covers` tag). The spec the id belongs to is taken, in this order, from
//   1. a spec number on the same line (`spec 021 FR-009`, `021 FR-009`, `@covers 021:FR-009`),
//   2. the spec numbers named anywhere in the file (`spec 018`, `specs/018-...`),
//   3. the spec(s) that the folder of the test file implements (moduleSpecs below).
// When several candidate specs define the same id, each of them is credited (flagged `~`).

/**
 * Which specs a source folder (or tests/ file) implements; the last resort of the attribution.
 */
export const moduleSpecs: Record<string, string[]> = {
  "src/game/time": ["001"],
  "src/game/ecs": ["002", "003"],
  "src/game/task": ["003", "013"],
  "src/game/map": ["004"],
  "src/game/inventory": ["005"],
  "src/game/save": ["006"],
  "src/game/engine": ["001", "007", "010", "011"],
  "src/game/worldgen": ["009"],
  "src/game/pathfinding": ["012"],
  "src/game/ai": ["013"],
  "src/game/behavior": ["013"],
  "src/game/production": ["014"],
  "src/game/zones": ["015"],
  "src/game/construction": ["016"],
  "src/game/jobs": ["017"],
  "src/game/crier": ["017"],
  "src/game/storage": ["018"],
  "src/game/trade": ["019"],
  "src/game/skills": ["020"],
  "src/game/factions": ["021"],
  "src/game/diplomacy": ["021"],
  "src/game/content": ["022"],
  "src/game/gathering": ["022"],
  "src/renderers": ["024"],
  "src/game/status": ["025"],
  "src/game/standing": ["026"],
  "src/game/settlement": ["027"],
  "src/game/identity": ["028"],
  "src/game/chronicle": ["028"],
  "src/game/housing": ["029"],
  scripts: ["023"],
  "tests/scripts": ["023"],
  "tests/style-fixtures": ["023"],
};

/**
 * One requirement of a spec.
 */
export type Requirement = {
  spec: string;
  id: string;
  text: string;
};

/**
 * Coverage of one spec.
 */
export type SpecCoverage = {
  spec: string;
  name: string;
  total: number;
  covered: number;
  ambiguous: number;
  uncovered: Requirement[];
};

const idPattern = /\b(?:FR|SC)-\d{3}\b/g;
const definitionPattern = /^\s*[-*]\s*\*\*((?:FR|SC)-\d{3})\*\*:?\s*(.*)$/;

function walk(dir: string, accept: (file: string) => boolean): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  const found: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (entry === "node_modules" || entry === "dist" || entry === "build" || entry === "coverage") {
      continue;
    }
    if (statSync(full).isDirectory()) {
      found.push(...walk(full, accept));
    } else if (accept(full)) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Reads the requirement definitions (`- **FR-001**: ...`) of every `specs/NNN-name/spec.md`.
 *
 * @param specsDir - The folder with the spec folders.
 * @returns The spec names by number and all requirements.
 */
export function readSpecs(specsDir: string): {
  names: Map<string, string>;
  requirements: Requirement[];
} {
  const names = new Map<string, string>();
  const requirements: Requirement[] = [];
  for (const folder of readdirSync(specsDir).sort()) {
    const match = /^(\d{3})-(.+)$/.exec(folder);
    const file = join(specsDir, folder, "spec.md");
    if (match === null || !existsSync(file)) {
      continue;
    }
    const spec = match[1] as string;
    names.set(spec, match[2] as string);
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const definition = definitionPattern.exec(line);
      if (definition !== null) {
        const text = (definition[2] as string).replace(/\s+/g, " ").trim();
        requirements.push({ spec, id: definition[1] as string, text });
      }
    }
  }
  return { names, requirements };
}

/**
 * Finds the spec numbers a path implements by its folder.
 *
 * @param file - A path relative to the repository root, with `/` separators.
 * @returns Candidate spec numbers, possibly empty.
 */
export function specsOfPath(file: string): string[] {
  let best: string[] = [];
  let bestLength = -1;
  for (const [folder, specs] of Object.entries(moduleSpecs)) {
    if ((file === folder || file.startsWith(`${folder}/`)) && folder.length > bestLength) {
      best = specs;
      bestLength = folder.length;
    }
  }
  return best;
}

/**
 * Finds the spec numbers a file's text names (`spec 018`, `specs/018-...`, `018 FR-004`).
 *
 * @param text - The file text.
 * @param known - The spec numbers that exist.
 * @returns The named spec numbers.
 */
export function specsNamedIn(text: string, known: ReadonlySet<string>): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/\bspecs?[\s/]+(\d{3})\b/gi)) {
    found.add(match[1] as string);
  }
  for (const match of text.matchAll(/\b(\d{3})[\s:]+(?:FR|SC)-\d{3}\b/g)) {
    found.add(match[1] as string);
  }
  return [...found].filter((spec) => known.has(spec));
}

/**
 * Collects the credits one test file gives: pairs of spec number (or null when ambiguous) and id.
 *
 * @param file - Repository relative path.
 * @param text - File text.
 * @param known - The spec numbers that exist.
 * @returns Each mention as `{ids, specs}`, `specs` being the candidates.
 */
export function mentionsIn(
  file: string,
  text: string,
  known: ReadonlySet<string>,
): { id: string; specs: string[] }[] {
  const fileSpecs = specsNamedIn(text, known);
  const moduleCandidates = specsOfPath(file);
  const fallback = fileSpecs.length > 0 ? fileSpecs : moduleCandidates;
  const mentions: { id: string; specs: string[] }[] = [];
  for (const line of text.split("\n")) {
    const ids = line.match(idPattern);
    if (ids === null) {
      continue;
    }
    const onLine = specsNamedIn(line, known);
    const covers = /@covers\s+(.*)/.exec(line);
    for (const id of ids) {
      const tagged =
        covers === null ? null : new RegExp(`\\b(\\d{3}):${id}\\b`).exec(covers[1] as string)?.[1];
      const specs =
        tagged !== null && tagged !== undefined && known.has(tagged)
          ? [tagged]
          : onLine.length > 0
            ? onLine
            : fallback;
      mentions.push({ id, specs });
    }
  }
  return mentions;
}

/**
 * Computes the coverage of every spec.
 *
 * @param repository - The repository root.
 * @returns Coverage per spec in spec order.
 */
export function computeCoverage(repository: string): SpecCoverage[] {
  const { names, requirements } = readSpecs(join(repository, "specs"));
  const known = new Set(names.keys());
  const byKey = new Map(
    requirements.map((requirement) => [`${requirement.spec}:${requirement.id}`, requirement]),
  );
  const direct = new Set<string>();
  const shared = new Set<string>();
  const testFiles = [
    ...walk(join(repository, "src"), (file) => /\.test\.tsx?$/.test(file)),
    ...walk(join(repository, "tests"), (file) => /\.test\.tsx?$/.test(file)),
    ...walk(join(repository, "tests", "soak"), (file) => /\.ts$/.test(file)),
    ...walk(join(repository, "scripts"), (file) => /\.test\.ts$/.test(file)),
  ];
  for (const file of new Set(testFiles)) {
    const path = relative(repository, file).split(sep).join("/");
    const text = readFileSync(file, "utf8");
    for (const { id, specs } of mentionsIn(path, text, known)) {
      const defining = specs.filter((spec) => byKey.has(`${spec}:${id}`));
      for (const spec of defining) {
        (defining.length === 1 ? direct : shared).add(`${spec}:${id}`);
      }
    }
  }
  const result: SpecCoverage[] = [];
  for (const [spec, name] of names) {
    const own = requirements.filter((requirement) => requirement.spec === spec);
    const uncovered = own.filter((requirement) => {
      const key = `${spec}:${requirement.id}`;
      return !direct.has(key) && !shared.has(key);
    });
    const ambiguous = own.filter((requirement) => {
      const key = `${spec}:${requirement.id}`;
      return !direct.has(key) && shared.has(key);
    }).length;
    result.push({
      spec,
      name,
      total: own.length,
      covered: own.length - uncovered.length,
      ambiguous,
      uncovered,
    });
  }
  return result;
}

/**
 * Renders the Markdown report.
 *
 * @param coverage - The result of {@link computeCoverage}.
 * @returns The text of docs/FR-COVERAGE.md.
 */
export function renderReport(coverage: SpecCoverage[]): string {
  const total = coverage.reduce((sum, entry) => sum + entry.total, 0);
  const covered = coverage.reduce((sum, entry) => sum + entry.covered, 0);
  const percent = (part: number, whole: number): string =>
    whole === 0 ? "n/a" : `${Math.round((part * 1000) / whole) / 10}%`;
  const lines = [
    "# FR and SC coverage",
    "",
    "<!-- Generated by `npm run fr-coverage` (scripts/fr-coverage.ts). Do not edit by hand. -->",
    "",
    `Headline: **${covered} of ${total}** requirement ids (FR and SC) of ${coverage.length} specs are named by at least one test (${percent(covered, total)}).`,
    "",
    "An id counts as covered when a test file mentions it in a test name, a comment or an `@covers <spec>:<id>` tag. The spec is taken from a spec number on the same line, else from the specs the file names, else from the folder (see `moduleSpecs` in the script). `~` marks ids credited to several candidate specs because the file does not say which one it means. The check is a traceability aid, not proof that the requirement is fully tested; it is not a CI gate yet (task 7.2).",
    "",
    "| Spec | Requirements | Covered | Of which `~` | Percent |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...coverage.map(
      (entry) =>
        `| ${entry.spec}-${entry.name} | ${entry.total} | ${entry.covered} | ${entry.ambiguous} | ${percent(entry.covered, entry.total)} |`,
    ),
    "",
    "## Uncovered requirements",
    "",
  ];
  for (const entry of coverage) {
    if (entry.uncovered.length === 0) {
      continue;
    }
    lines.push(`### ${entry.spec}-${entry.name} (${entry.uncovered.length})`, "");
    for (const requirement of entry.uncovered) {
      const text =
        requirement.text.length > 110 ? `${requirement.text.slice(0, 107)}...` : requirement.text;
      lines.push(`- ${requirement.id}: ${text}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}
