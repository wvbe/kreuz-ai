import { useState } from "react";
import type { BoardSummaryView, BoardView } from "../../../game/jobs/jobViews";
import { useEngineHost } from "../engine/useEngineHost";
import { useStore } from "../engine/useStore";
import { customJobCommand, parseWhole } from "./commandPayloads";
import { FormError, FormField } from "./FormField";
import { useSender } from "./useSender";
import { useView } from "./useView";

const userManagedMode = "user-managed";

type PostingFormProps = { board: BoardSummaryView };

function CustomJobForm(props: PostingFormProps) {
  const host = useEngineHost();
  const selection = useStore(host.selection);
  const sender = useSender();
  const [jobTypeId, setJobTypeId] = useState("");
  const [cell, setCell] = useState("");
  const [priority, setPriority] = useState("");
  const [wage, setWage] = useState("");
  const mapId = selection.activeMapId ?? props.board.mapId ?? 1;
  return (
    <form
      className="kv-form"
      aria-label={`Post a job on board ${props.board.boardId}`}
      onSubmit={(event) => {
        event.preventDefault();
        sender.sendForm(
          customJobCommand({
            boardId: props.board.boardId,
            jobTypeId,
            mapId,
            cell: cell === "" && selection.cell !== null ? String(selection.cell) : cell,
            priority,
            wage,
            direct: String(props.board.mode) !== userManagedMode,
          }),
        );
      }}
    >
      <FormField label="Job type" error={sender.errors["jobTypeId"]}>
        <input value={jobTypeId} onChange={(event) => setJobTypeId(event.target.value)} />
      </FormField>
      <FormField label="Cell (default: the selected cell)" error={sender.errors["cellIndex"]}>
        <input
          value={cell}
          placeholder={selection.cell === null ? "" : String(selection.cell)}
          onChange={(event) => setCell(event.target.value)}
        />
      </FormField>
      <FormField label="Priority" error={sender.errors["priority"]}>
        <input value={priority} onChange={(event) => setPriority(event.target.value)} />
      </FormField>
      <FormField label="Wage" error={sender.errors["wage"]}>
        <input value={wage} onChange={(event) => setWage(event.target.value)} />
      </FormField>
      <FormError message={sender.errors[""]} />
      <button type="submit">Post job</button>
    </form>
  );
}

function PostingList(props: { boardId: number }) {
  const sender = useSender();
  const board = useView<BoardView>("jobs-on", { boardId: props.boardId });
  const [priorities, setPriorities] = useState<{ [postingId: number]: string }>({});
  if (board === null || board.postings.length === 0) {
    return <p>No postings.</p>;
  }
  return (
    <ul className="kv-postings">
      {board.postings.map((posting) => (
        <li key={posting.id} data-posting={posting.id}>
          #{posting.id} {posting.jobTypeId} at cell {posting.target.cellIndex}, {posting.status},
          priority {posting.priority}
          {posting.wage > 0 ? `, wage ${posting.wage}` : ""}
          <div className="kv-row-actions">
            <input
              aria-label={`New priority of posting ${posting.id}`}
              size={3}
              value={priorities[posting.id] ?? ""}
              onChange={(event) =>
                setPriorities({ ...priorities, [posting.id]: event.target.value })
              }
            />
            <button
              type="button"
              disabled={parseWhole(priorities[posting.id] ?? "") === null}
              onClick={() =>
                sender.send({
                  kind: "ModifyPosting",
                  boardId: props.boardId,
                  postingId: posting.id,
                  priority: parseWhole(priorities[posting.id] ?? "") ?? 0,
                })
              }
            >
              Change priority
            </button>
            <button
              type="button"
              onClick={() =>
                sender.send({
                  kind: "RemovePosting",
                  boardId: props.boardId,
                  postingId: posting.id,
                })
              }
            >
              Remove
            </button>
          </div>
        </li>
      ))}
      <li>
        <FormError message={sender.errors[""]} />
      </li>
    </ul>
  );
}

/**
 * The job boards of the government panel: every board with its mode and counts, pause or resume
 * (`SetJobBoardPaused`), its postings with remove and priority change (`RemovePosting`,
 * `ModifyPosting`; a Town Crier carries them, see the pending list) and the custom-job form.
 *
 * @returns The tab.
 */
export function JobBoardsTab() {
  const sender = useSender();
  const boards = useView<readonly BoardSummaryView[]>("job-boards", {}) ?? [];
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="kv-boards">
      {boards.length === 0 ? <p>No job boards.</p> : null}
      {boards.map((board) => (
        <section
          key={board.boardId}
          aria-label={`Board ${board.boardId}`}
          data-board={board.boardId}
        >
          <h4>
            Board #{board.boardId} ({String(board.mode)})
          </h4>
          <p>
            {board.paused ? "Paused" : "Running"}; {board.open} open, {board.claimed} claimed
          </p>
          <div className="kv-row-actions">
            <button
              type="button"
              onClick={() =>
                sender.send({
                  kind: "SetJobBoardPaused",
                  boardId: board.boardId,
                  paused: !board.paused,
                })
              }
            >
              {board.pausedByPlayer ? "Resume board" : "Pause board"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(open === board.boardId ? null : board.boardId)}
            >
              {open === board.boardId ? "Hide postings" : "Show postings"}
            </button>
          </div>
          {open === board.boardId ? (
            <>
              <PostingList boardId={board.boardId} />
              <CustomJobForm board={board} />
            </>
          ) : null}
        </section>
      ))}
      <FormError message={sender.errors[""]} />
    </div>
  );
}
