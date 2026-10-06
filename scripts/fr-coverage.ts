import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeCoverage, renderReport } from "./lib/frCoverage";

const root = process.cwd();
const coverage = computeCoverage(root);
writeFileSync(join(root, "docs", "FR-COVERAGE.md"), renderReport(coverage));
for (const entry of coverage) {
  console.log(
    `${entry.spec}-${entry.name}: ${entry.covered}/${entry.total} covered, ${entry.uncovered.length} uncovered`,
  );
}
const total = coverage.reduce((sum, entry) => sum + entry.total, 0);
const covered = coverage.reduce((sum, entry) => sum + entry.covered, 0);
console.log(`total: ${covered}/${total} requirement ids covered; report in docs/FR-COVERAGE.md`);
