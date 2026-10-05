import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { runCli } from "./runCli";

// Entry point: `vite-node src/renderers/cli/main.ts [--jsonl | --script <file>]`. All behaviour
// lives in runCli so it can be tested in-process; this file only wires Node's stdin, stdout and
// file system to it.

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });

runCli(process.argv.slice(2), {
  lines,
  stdout: (text) => {
    process.stdout.write(text);
  },
  stderr: (text) => {
    process.stderr.write(text);
  },
  files: {
    readText: (path) => readFileSync(path, "utf8"),
    writeText: (path, text) => {
      writeFileSync(path, text, "utf8");
    },
  },
  entropy: () => Math.floor(Math.random() * 4_294_967_296),
  interactive: process.stdin.isTTY,
})
  .then((code) => {
    process.exitCode = code;
  })
  .catch((failure: Error) => {
    process.stderr.write(`fatal: ${failure.stack ?? failure.message}\n`);
    process.exitCode = 70;
  });
