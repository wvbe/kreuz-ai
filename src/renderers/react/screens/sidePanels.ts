import type { ComponentType } from "react";
import { BuildMenuPanel } from "../command/BuildMenuPanel";
import { ConstructionPanel } from "../command/ConstructionPanel";
import { PendingPanel } from "../command/PendingPanel";
import { ZonePanel } from "../command/ZonePanel";
import { InspectionPanel } from "../panels/InspectionPanel";
import { SettlementProgressPanel } from "../views/SettlementProgressPanel";

/**
 * A panel docked beside the map. It reads the selection with `useStore(host.selection)` and its
 * data with `useQuery`; the dock renders every registered panel in order.
 */
export type SidePanel = {
  /**
   * Stable id (used as the React key and in tests).
   */
  id: string;
  title: string;
  component: ComponentType;
};

/**
 * The panels beside the map. Tasks 6.3 to 6.5 append theirs here (inspection, the pending
 * command list, the build menu); nothing else has to change.
 */
export const sidePanels: readonly SidePanel[] = [
  { id: "inspection", title: "Inspection", component: InspectionPanel },
  { id: "settlement-progress", title: "Settlement", component: SettlementProgressPanel },
  { id: "build-menu", title: "Build", component: BuildMenuPanel },
  { id: "zones", title: "Zones", component: ZonePanel },
  { id: "construction", title: "Construction", component: ConstructionPanel },
  { id: "pending-commands", title: "Pending commands", component: PendingPanel },
];
