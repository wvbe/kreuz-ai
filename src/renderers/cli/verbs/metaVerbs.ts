import { verbDone, verbFailed } from "./Verb";
import type { Verb } from "./Verb";

/**
 * Verbs about the shell itself: help, quit.
 */
export const metaVerbs: readonly Verb[] = [
  {
    name: "help",
    usage: "help [verb]",
    summary: "list the verbs, or describe one",
    run: (args, { verbs }) => {
      if (args[0] !== undefined) {
        const verb = verbs.find((candidate) => candidate.name === args[0]);
        return verb === undefined
          ? verbFailed(`unknown command "${args[0]}"`)
          : verbDone([`${verb.usage}`, `  ${verb.summary}`]);
      }
      const width = Math.max(...verbs.map((verb) => verb.usage.length));
      return verbDone(verbs.map((verb) => `${verb.usage.padEnd(width)}  ${verb.summary}`));
    },
  },
  {
    name: "quit",
    usage: "quit",
    summary: "leave the shell",
    run: () => ({ ok: true, text: "bye", quit: true }),
  },
];
