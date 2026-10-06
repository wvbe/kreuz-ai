import type { ComponentType } from "react";
import { InspectionPanel } from "../panels/InspectionPanel";

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
];
