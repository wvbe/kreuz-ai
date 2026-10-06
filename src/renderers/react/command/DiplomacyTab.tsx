import { useState } from "react";
import type {
  DiplomacyFactionView,
  EnvoyView,
  ProposalView,
} from "../../../game/diplomacy/diplomacyViews";
import { envoyCommand, EnvoyAct, giftCommand } from "./commandPayloads";
import { FormError, FormField } from "./FormField";
import { useSender } from "./useSender";
import { useView } from "./useView";

const envoyActs: readonly { act: EnvoyAct; label: string }[] = [
  { act: EnvoyAct.Overture, label: "Overture" },
  { act: EnvoyAct.TradeAgreement, label: "Trade agreement" },
  { act: EnvoyAct.Peace, label: "Declare peace" },
  { act: EnvoyAct.Neutrality, label: "Declare neutrality" },
  { act: EnvoyAct.War, label: "Declare war" },
];

function FactionForm(props: { faction: DiplomacyFactionView }) {
  const sender = useSender();
  const [coins, setCoins] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [quantity, setQuantity] = useState("");
  const { faction } = props;
  return (
    <section aria-label={`Envoy to ${faction.name}`}>
      <h4>Send an envoy to {faction.name}</h4>
      <div className="kv-row-actions">
        {envoyActs.map((entry) => (
          <button
            key={entry.act}
            type="button"
            onClick={() => sender.sendForm(envoyCommand(faction.factionId, entry.act))}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <form
        className="kv-form"
        aria-label={`Gift to ${faction.name}`}
        onSubmit={(event) => {
          event.preventDefault();
          sender.sendForm(
            giftCommand({ factionId: faction.factionId, coins, materialId, quantity }),
          );
        }}
      >
        <FormField label="Gift coins" error={sender.errors["coins"]}>
          <input value={coins} onChange={(event) => setCoins(event.target.value)} />
        </FormField>
        <FormField label="Gift goods" error={sender.errors["materialId"]}>
          <input value={materialId} onChange={(event) => setMaterialId(event.target.value)} />
        </FormField>
        <FormField label="How many" error={sender.errors["quantity"]}>
          <input value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        </FormField>
        <FormError message={sender.errors[""]} />
        <button type="submit">Send gift</button>
      </form>
    </section>
  );
}

/**
 * The diplomacy tab (spec 021): the faction table with both standings and attitude bands, a gift
 * and envoy form for the faction you choose (`IssueDiplomaticAct`), the directives under way
 * (cancel with `CancelDiplomaticDirective`) and the proposals waiting for an answer
 * (`RespondToProposal`).
 *
 * @returns The tab.
 */
export function DiplomacyTab() {
  const sender = useSender();
  const factions = useView<readonly DiplomacyFactionView[]>("factions-diplomacy", {}) ?? [];
  const directives = useView<readonly EnvoyView[]>("directives", {}) ?? [];
  const proposals = useView<readonly ProposalView[]>("proposals", {}) ?? [];
  const [chosen, setChosen] = useState<number | null>(null);
  const faction = factions.find((entry) => entry.factionId === chosen) ?? null;
  return (
    <div className="kv-diplomacy">
      <table className="kv-table">
        <thead>
          <tr>
            <th>Faction</th>
            <th>Their view of us</th>
            <th>Our view of them</th>
            <th>Agreement</th>
            <th>Envoys</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {factions.map((row) => (
            <tr key={row.factionId} data-faction={row.factionId}>
              <td>
                {row.name}
                {row.hostile ? " (hostile)" : ""}
              </td>
              <td>
                {row.theirAttitude} ({row.theirStanding})
              </td>
              <td>
                {row.ourAttitude} ({row.ourStanding})
              </td>
              <td>{row.tradeAgreement ? "yes" : "no"}</td>
              <td>{row.envoysUnderWay}</td>
              <td>
                <button type="button" onClick={() => setChosen(row.factionId)}>
                  Envoy to {row.name}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {faction === null ? null : <FactionForm key={faction.factionId} faction={faction} />}
      <h4>Directives under way</h4>
      {directives.length === 0 ? <p>No directives pending.</p> : null}
      <ul>
        {directives.map((envoy) => (
          <li key={envoy.envoyId} data-envoy={envoy.envoyId}>
            #{envoy.envoyId} {envoy.actType}
            {envoy.declaration === null ? "" : ` (${envoy.declaration})`} to {envoy.targetName}:{" "}
            {envoy.status}, ETA {envoy.ticksLeft} ticks
            {envoy.cargo.length === 0
              ? ""
              : `, carrying ${envoy.cargo.map((item) => `${item.quantity} ${item.materialId}`).join(", ")}`}
            {envoy.giftValueCoins > 0 ? ` (worth ${envoy.giftValueCoins} coins)` : ""}{" "}
            <button
              type="button"
              onClick={() =>
                sender.send({ kind: "CancelDiplomaticDirective", envoyId: envoy.envoyId })
              }
            >
              Cancel
            </button>
          </li>
        ))}
      </ul>
      <h4>Proposals</h4>
      {proposals.length === 0 ? <p>No proposals waiting.</p> : null}
      <ul>
        {proposals.map((proposal) => (
          <li key={proposal.proposalId} data-proposal={proposal.proposalId}>
            {proposal.fromName} offers {proposal.actType} ({proposal.ticksLeft} ticks left){" "}
            {(["accept", "reject", "counter"] as const).map((response) => (
              <button
                key={response}
                type="button"
                onClick={() =>
                  sender.send({
                    kind: "RespondToProposal",
                    proposalId: proposal.proposalId,
                    response,
                  })
                }
              >
                {response === "accept" ? "Accept" : response === "reject" ? "Reject" : "Counter"}
              </button>
            ))}
          </li>
        ))}
      </ul>
      <FormError message={sender.errors[""]} />
    </div>
  );
}
