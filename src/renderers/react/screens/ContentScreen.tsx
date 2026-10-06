import { useState } from "react";
import { ContentKind } from "../../../game/api/contentQueries";
import type {
  ContentEntryView,
  ContentLink,
  ContentRegistriesView,
} from "../../../game/api/contentQueries";
import type { JsonValue } from "../../../game/engine/EventBus";
import { useQuery } from "../engine/useGameState";
import { useStaticQuery } from "../engine/useStaticQuery";
import { Link } from "../ui/EntityLink";
import { KeepInStockButton } from "../ui/KeepInStockButton";
import { KeyValueList } from "../ui/KeyValueList";
import "../panels/panels.css";

type UnlockRow = {
  contentKind: string;
  contentId: string;
  unlockTier: string;
  unlocked: boolean;
  lockText: string | null;
};

type Chosen = { kind: ContentKind; id: string };

/**
 * The `unlocks` content kind that belongs to a browser category (the others are never locked by
 * the settlement tier).
 */
const unlockKindOf: { readonly [kind in ContentKind]?: string } = {
  [ContentKind.Furniture]: "furniture",
  [ContentKind.Zone]: "zone_type",
  [ContentKind.Recipe]: "recipe",
  [ContentKind.Job]: "job_type",
};

function isRecord(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatField(value: JsonValue): string {
  if (Array.isArray(value)) {
    return value.length === 0 ? "none" : value.map((item) => formatField(item)).join("; ");
  }
  if (isRecord(value)) {
    const materialId = value["materialId"];
    const quantity = value["quantity"];
    if (typeof materialId === "string" && typeof quantity === "number") {
      return `${materialId.replaceAll("_", " ")} x${quantity}`;
    }
    return Object.entries(value)
      .map(([name, item]) => `${name} ${formatField(item)}`)
      .join(", ");
  }
  return typeof value === "string" ? value.replaceAll("_", " ") : String(value);
}

/**
 * The materials a record offers "Keep in stock..." for (spec 024 FR-030): a material itself, the
 * outputs of a recipe card.
 *
 * @param entry - The entry shown.
 * @returns The material ids, empty for other records.
 */
function keepInStockMaterials(entry: ContentEntryView): string[] {
  if (entry.kind === ContentKind.Material) {
    return [entry.id];
  }
  if (entry.kind !== ContentKind.Recipe) {
    return [];
  }
  const outputs = entry.fields["outputs"];
  if (!Array.isArray(outputs)) {
    return [];
  }
  return outputs.flatMap((output) => {
    const materialId = isRecord(output) ? output["materialId"] : undefined;
    return typeof materialId === "string" ? [materialId] : [];
  });
}

function LinkList(props: {
  title: string;
  links: readonly ContentLink[];
  onChoose: (chosen: Chosen) => void;
}) {
  if (props.links.length === 0) {
    return null;
  }
  return (
    <div>
      <h4>{props.title}</h4>
      <ul>
        {props.links.map((link) => (
          <li key={`${link.kind}:${link.id}:${link.role}`}>
            <span className="kv-dim">{link.role}: </span>
            <Link
              label={link.name}
              title={`${link.kind} ${link.id}`}
              onClick={() => {
                props.onChoose({ kind: link.kind, id: link.id });
              }}
            />{" "}
            <span className="kv-dim">({link.kind})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Detail(props: {
  chosen: Chosen;
  locks: ReadonlyMap<string, UnlockRow>;
  onChoose: (chosen: Chosen) => void;
}) {
  const result = useStaticQuery<ContentEntryView | null>("content-entry", {
    kind: props.chosen.kind,
    id: props.chosen.id,
  });
  const entry = result.ok ? result.data : null;
  if (entry === null) {
    return <p>No such entry.</p>;
  }
  const lock = props.locks.get(`${unlockKindOf[entry.kind] ?? ""}:${entry.id}`);
  const keepable = keepInStockMaterials(entry);
  return (
    <article aria-label={entry.name}>
      <h3>{entry.name}</h3>
      <p className="kv-dim">
        {entry.kind} / {entry.id}
        {lock !== undefined && !lock.unlocked ? (
          <strong className="kv-locked">
            {" "}
            - {lock.lockText ?? `Unlocks at ${lock.unlockTier}`}
          </strong>
        ) : null}
      </p>
      <KeyValueList
        rows={Object.entries(entry.fields)
          .filter(([name]) => name !== "id" && name !== "name")
          .map(([name, value]) => ({ label: name, value: formatField(value) }))}
      />
      {keepable.map((materialId) => (
        <KeepInStockButton key={materialId} materialId={materialId} />
      ))}
      <LinkList title="Refers to" links={entry.links} onChoose={props.onChoose} />
      <LinkList title="Used by" links={entry.usedBy} onChoose={props.onChoose} />
    </article>
  );
}

/**
 * The content browser (spec 024, plan 6.5): live search across every content registry the
 * `content-registries` query exposes, interlinked entries (recipe to materials, material to the
 * recipes that use it, furniture to the recipes it enables), and locked content marked with
 * `Unlocks at <Tier>` from the `unlocks` query.
 *
 * @returns The screen.
 */
export function ContentScreen() {
  const registries = useStaticQuery<ContentRegistriesView>("content-registries");
  const unlocks = useQuery<readonly UnlockRow[]>("unlocks");
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const locks = new Map<string, UnlockRow>();
  if (unlocks.ok) {
    for (const row of unlocks.data) {
      locks.set(`${row.contentKind}:${row.contentId}`, row);
    }
  }
  const needle = search.trim().toLowerCase();
  const categories = registries.ok ? registries.data.categories : [];
  return (
    <section className="kv-screen kv-content" aria-label="Content browser">
      <div className="kv-content-list">
        <h2>Content browser</h2>
        <input
          type="search"
          aria-label="Search content"
          placeholder="Search by name or id"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
        {categories.map((category) => {
          const entries = category.entries.filter(
            (entry) =>
              needle === "" ||
              entry.name.toLowerCase().includes(needle) ||
              entry.id.toLowerCase().includes(needle),
          );
          return entries.length === 0 ? null : (
            <div key={category.kind} data-category={category.kind}>
              <h4>
                {category.label} ({entries.length})
              </h4>
              <ul>
                {entries.map((entry) => {
                  const lock = locks.get(`${unlockKindOf[category.kind] ?? ""}:${entry.id}`);
                  const locked = lock !== undefined && !lock.unlocked;
                  return (
                    <li key={entry.id} className={locked ? "kv-locked" : undefined}>
                      <Link
                        label={entry.name}
                        onClick={() => {
                          setChosen({ kind: category.kind, id: entry.id });
                        }}
                      />
                      {locked ? (
                        <span className="kv-dim">
                          {" "}
                          {lock.lockText ?? `Unlocks at ${lock.unlockTier}`}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      <div className="kv-content-detail">
        {chosen === null ? (
          <p className="kv-dim">Choose an entry to see its definition and what it links to.</p>
        ) : (
          <Detail chosen={chosen} locks={locks} onChoose={setChosen} />
        )}
      </div>
    </section>
  );
}
