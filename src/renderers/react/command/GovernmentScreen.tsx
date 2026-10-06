import { useState } from "react";
import { takeStandingOrderMaterial } from "../views/standingOrderRequests";
import type { ReactElement } from "react";
import { DiplomacyTab } from "./DiplomacyTab";
import { JobBoardsTab } from "./JobBoardsTab";
import { OfficesTab } from "./OfficesTab";
import { PendingPanel } from "./PendingPanel";
import { ProductionTab } from "./ProductionTab";
import { StandingOrdersTab } from "./StandingOrdersTab";
import { TradeTab } from "./TradeTab";

/**
 * The tabs of the government command panel.
 */
export enum GovernmentTab {
  Boards = "Job boards",
  Pending = "Pending commands",
  Production = "Production orders",
  Standing = "Standing orders",
  Offices = "Steward and Town Crier",
  Diplomacy = "Diplomacy",
  Trade = "Trade",
}

const tabs: readonly {
  tab: GovernmentTab;
  render: (requestedMaterial: string | null) => ReactElement;
}[] = [
  { tab: GovernmentTab.Boards, render: () => <JobBoardsTab /> },
  { tab: GovernmentTab.Pending, render: () => <PendingPanel /> },
  { tab: GovernmentTab.Production, render: () => <ProductionTab /> },
  {
    tab: GovernmentTab.Standing,
    render: (requestedMaterial) => (
      <StandingOrdersTab
        {...(requestedMaterial === null ? {} : { initialMaterialId: requestedMaterial })}
      />
    ),
  },
  { tab: GovernmentTab.Offices, render: () => <OfficesTab /> },
  { tab: GovernmentTab.Diplomacy, render: () => <DiplomacyTab /> },
  { tab: GovernmentTab.Trade, render: () => <TradeTab /> },
];

/**
 * The government command panel (spec 024 FR-010, FR-029 to FR-031): job boards, pending commands,
 * production orders, standing orders, the Steward and Town Criers, diplomacy and trade, each a
 * tab. Every action is a command through `host.commands.send`.
 *
 * @param props - The tab to open first (default the job boards).
 * @returns The screen.
 */
export function GovernmentScreen(props: { initialTab?: GovernmentTab }) {
  // A "Keep in stock..." request (spec 024 FR-030) opens the standing orders with its material.
  const [requestedMaterial] = useState(takeStandingOrderMaterial);
  const [active, setActive] = useState(
    props.initialTab ??
      (requestedMaterial === null ? GovernmentTab.Boards : GovernmentTab.Standing),
  );
  const current = tabs.find((entry) => entry.tab === active) ?? tabs[0];
  return (
    <section className="kv-screen kv-government">
      <h2>Government</h2>
      <div role="tablist" aria-label="Government" className="kv-tabs">
        {tabs.map((entry) => (
          <button
            key={entry.tab}
            type="button"
            role="tab"
            aria-selected={entry.tab === active}
            onClick={() => setActive(entry.tab)}
          >
            {entry.tab}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="kv-tabpanel">
        {current?.render(requestedMaterial)}
      </div>
    </section>
  );
}
