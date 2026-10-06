import { runSoak } from "./soakRun";
import type { SoakOptions } from "./soakRun";

// `npm run soak [-- --ticks N --every N --trips N]`: two long deterministic games, one per seed,
// with the invariants checked as they go. Exit code 1 when anything is violated.

function numberFlag(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? Number(process.argv[index + 1]) : fallback;
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

const ticks = numberFlag("ticks", 10_000);
const checkEvery = numberFlag("every", 250);
const roundTrips = numberFlag("trips", 6);
const runs: SoakOptions[] = [
  { seed: 42, difficulty: "steady", ticks, checkEvery, roundTrips },
  { seed: 7, difficulty: "peaceful", ticks, checkEvery, roundTrips },
];

let failed = false;
for (const options of runs) {
  const started = Date.now();
  const report = runSoak(options, (tick) => {
    if (tick % 2500 === 0) {
      console.log(`  seed ${options.seed}: tick ${tick}`);
    }
  });
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  console.log(
    `seed ${report.seed} (${options.difficulty}): ${report.ticks} ticks, ${report.checkpoints} checkpoints, ` +
      `${report.roundTrips} save/load round trips, ${report.ledgerChecks} ledger checks, ` +
      `entities max ${report.maxEntities} final ${report.finalEntities}, hash ${report.finalHash}, ${seconds}s`,
  );
  if (report.violations.length > 0) {
    failed = true;
    console.error(`  ${report.violations.length} violation(s), first 20:`);
    for (const violation of report.violations.slice(0, 20)) {
      console.error(`  - ${violation}`);
    }
  }
}
process.exitCode = failed ? 1 : 0;
console.log(failed ? "soak: FAILED" : "soak: all invariants held");
