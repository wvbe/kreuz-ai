import { checkConventions } from "./lib/conventions";

const violations = checkConventions("src");
if (violations.length > 0) {
  console.error("check:conventions - violations (spec 023):");
  for (const violation of violations) {
    console.error(`  ${violation.file}: ${violation.message}`);
  }
  process.exitCode = 1;
} else {
  console.log("check:conventions - no barrel, file-name or test-pairing violations");
}
