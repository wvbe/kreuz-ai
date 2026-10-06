import type { JournalView } from "../../../game/chronicle/chronicleViews";
import { useEngineHost } from "../engine/useEngineHost";
import { useQuery } from "../engine/useGameState";
import { Screen } from "../navigation/Screen";
import { Link } from "../ui/EntityLink";
import "./panels.css";

/**
 * Journal lines the Journal tab shows (the newest ones); the chronicle holds the rest.
 */
export const journalLinesShown = 8;

/**
 * The Journal tab: the newest journal lines of a citizen and a link to the chronicle.
 *
 * @param props - The citizen's id.
 * @returns The tab content.
 */
export function JournalTab(props: { entityId: number }) {
  const host = useEngineHost();
  const journal = useQuery<JournalView | null>("journal", { entityId: props.entityId });
  const entries = journal.ok && journal.data !== null ? journal.data.entries : [];
  const shown = entries.slice(-journalLinesShown).reverse();
  return (
    <div>
      {shown.length === 0 ? (
        <p className="kv-dim">Nothing written yet.</p>
      ) : (
        <ul className="kv-journal">
          {shown.map((entry) => (
            <li key={entry.momentId}>
              <span className="kv-dim">Day {entry.day}:</span> {entry.text}
            </li>
          ))}
        </ul>
      )}
      <Link
        label="Open the chronicle"
        onClick={() => {
          host.navigation.navigate(Screen.Chronicle);
        }}
      />
    </div>
  );
}
