import {
  measureBootstrap,
  measureOptionValidation,
  measureQueries,
  measureSettlementTick,
} from "./lib/perfCases";

// `npm run perf [-- --citizens N --ticks N]`: measures the performance success criteria of the
// specs on this machine and prints them as a table (docs/PERFORMANCE.md records a run).

function numberFlag(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? Number(process.argv[index + 1]) : fallback;
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

const citizens = numberFlag("citizens", 200);
const ticks = numberFlag("ticks", 288);
const round = (value: number): string => (Math.round(value * 100) / 100).toFixed(2);

const bootstrap = measureBootstrap();
const validation = measureOptionValidation();
const queries = measureQueries(1000);
const small = measureSettlementTick(6, ticks);
const large = measureSettlementTick(citizens, ticks);

console.log("| Criterion | Budget | Measured |");
console.log("| --- | --- | --- |");
console.log(`| bootstrap, no map (007 SC-001) | < 100 ms | ${round(bootstrap.bare)} ms |`);
console.log(`| bootstrap with the Small map | < 100 ms | ${round(bootstrap.withMap)} ms |`);
console.log(`| invalid options rejected (007 SC-002) | < 50 ms | ${round(validation)} ms |`);
for (const [name, value] of Object.entries(queries)) {
  if (name !== "entity count") {
    console.log(
      `| query ${name} with ${queries["entity count"]} entities (007 SC-007) | < 5 ms | ${round(value)} ms |`,
    );
  }
}
console.log(
  `| tick, 6 citizens (mean / worst of ${ticks}) | n/a | ${round(small.meanMs)} / ${round(small.worstMs)} ms |`,
);
console.log(
  `| tick, ${large.citizens} citizens (mean / worst of ${ticks}) | < 50 ms mean | ${round(large.meanMs)} / ${round(large.worstMs)} ms |`,
);
console.log(
  `| decision per citizen (013 SC-010, tick / citizens) | < 5 ms | ${round(large.meanMs / large.citizens)} ms |`,
);
