import { formatBoard } from "../formatJobs";
import { parseCount, verbDone, verbFailed } from "./Verb";
import type { Verb } from "./Verb";

/**
 * Job board verbs: `jobs`.
 */
export const jobVerbs: readonly Verb[] = [
  {
    name: "jobs",
    usage: "jobs [boardId]",
    summary: "list the job boards with their postings (one board when an id is given)",
    run: (args, { session }) => {
      const boards = session.query.run("job-boards", {});
      if (!boards.ok || !Array.isArray(boards.data)) {
        return verbFailed("the job boards are not available (no game?)");
      }
      const wanted = args[0] === undefined ? null : parseCount(args[0]);
      if (args[0] !== undefined && wanted === null) {
        return verbFailed("usage: jobs [boardId]");
      }
      const ids: number[] = [];
      for (const board of boards.data) {
        const id =
          typeof board === "object" && board !== null && !Array.isArray(board)
            ? board["boardId"]
            : undefined;
        if (typeof id === "number") {
          ids.push(id);
        }
      }
      const shown = ids.filter((id) => wanted === null || id === wanted);
      if (shown.length === 0) {
        return verbDone([wanted === null ? "no job boards" : `board ${wanted} does not exist`]);
      }
      return verbDone(
        shown.flatMap((id) => {
          const view = session.query.run("jobs-on", { boardId: id });
          return view.ok ? formatBoard(view.data) : [];
        }),
      );
    },
  },
];
