import { findMissingReadmes } from "./lib/readmes";

const missing = findMissingReadmes("src");
if (missing.length > 0) {
  console.error("check:readmes - folders without README.md (spec 023 FR-016):");
  for (const dir of missing) {
    console.error(`  ${dir}`);
  }
  process.exitCode = 1;
} else {
  console.log("check:readmes - every src folder has a README.md");
}
