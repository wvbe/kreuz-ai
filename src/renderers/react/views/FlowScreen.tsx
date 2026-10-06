import { useState } from "react";
import type { FlowParty, FlowRow } from "../../../game/status/statusTypes";
import { useEngineHost } from "../engine/useEngineHost";
import { useQuery } from "../engine/useGameState";
import { humanizeId } from "./blockedReasonText";
import { focusSubject } from "./focusSubject";
import { formatPerDay, sortByDeficit, sumBySource, trendArrow, trendDirection } from "./flowFormat";
import { openStandingOrderForm } from "./standingOrderRequests";
import { SubjectLabel } from "./SubjectLabel";
import "./views.css";

function Parties(props: { title: string; parties: readonly FlowParty[] }) {
  const host = useEngineHost();
  if (props.parties.length === 0) {
    return null;
  }
  return (
    <div>
      <h4>{props.title}</h4>
      <ul className="kv-rows">
        {props.parties.map((party, index) => {
          const subject = party.subject;
          return (
            <li key={`${party.source}-${subject?.id ?? "none"}-${index}`}>
              <span className="kv-badge">{party.source}</span> {party.quantity}
              {subject === null ? null : (
                <>
                  {" "}
                  <button
                    type="button"
                    className="kv-link"
                    onClick={() => focusSubject(host, subject)}
                  >
                    <SubjectLabel subject={subject} />
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FlowRowView(props: { row: FlowRow }) {
  const { row } = props;
  const [open, setOpen] = useState(false);
  const arrow = trendArrow(trendDirection(row.trend));
  const label = humanizeId(row.materialId);
  return (
    <>
      <tr data-material={row.materialId} className={row.netPerDayMilli < 0 ? "kv-deficit" : ""}>
        <th scope="row">{label}</th>
        <td>{formatPerDay(row.producedPerDayMilli)}</td>
        <td>{formatPerDay(row.consumedPerDayMilli)}</td>
        <td>{formatPerDay(row.netPerDayMilli)}</td>
        <td>{row.stock}</td>
        <td>{row.daysOfSupplyMilli === null ? "surplus" : formatPerDay(row.daysOfSupplyMilli)}</td>
        <td aria-label={`trend ${row.trend.join(", ")}`}>{arrow}</td>
        <td>
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${open ? "Hide" : "Show"} sources of ${label}`}
            onClick={() => setOpen(!open)}
          >
            {open ? "Hide" : "Sources"}
          </button>{" "}
          <button
            type="button"
            aria-label={`Keep ${label} in stock`}
            onClick={() => openStandingOrderForm(row.materialId)}
          >
            Keep in stock...
          </button>
        </td>
      </tr>
      {open ? (
        <tr className="kv-flow-detail">
          <td colSpan={8}>
            <p>
              Window: produced {row.windowProduced}, consumed {row.windowConsumed}.
            </p>
            <p>
              Produced by source:{" "}
              {sumBySource(row.producers)
                .map((entry) => `${entry.source} ${entry.quantity}`)
                .join(", ") || "nothing"}
              . Consumed by source:{" "}
              {sumBySource(row.consumers)
                .map((entry) => `${entry.source} ${entry.quantity}`)
                .join(", ") || "nothing"}
              .
            </p>
            <Parties title="Producers" parties={row.producers} />
            <Parties title="Consumers" parties={row.consumers} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

/**
 * The production flow screen (spec 024 FR-027): one row per material with produced, consumed and
 * net per game day, stock, days of supply and a trend arrow, the largest deficit first. A row
 * expands into the FlowSource attribution and its producers and consumers (each a link to the
 * subject on the map); "Keep in stock..." hands the material to the standing-order form.
 *
 * @returns The screen.
 */
export function FlowScreen() {
  const result = useQuery<readonly FlowRow[]>("flow", {});
  const rows = sortByDeficit(result.ok ? result.data : []);
  return (
    <section className="kv-screen kv-view">
      <h2>Production flow</h2>
      {rows.length === 0 ? (
        <p>No production or consumption recorded yet.</p>
      ) : (
        <table className="kv-table">
          <thead>
            <tr>
              <th scope="col">Material</th>
              <th scope="col">Produced/day</th>
              <th scope="col">Consumed/day</th>
              <th scope="col">Net/day</th>
              <th scope="col">Stock</th>
              <th scope="col">Days of supply</th>
              <th scope="col">Trend</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <FlowRowView key={row.materialId} row={row} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
