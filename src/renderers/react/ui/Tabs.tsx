import { useState } from "react";
import type { ReactNode } from "react";
import "./widgets.css";

/**
 * One tab of {@link Tabs}.
 */
export type TabDefinition = {
  id: string;
  label: string;
  /**
   * Called only while the tab is shown.
   */
  render: () => ReactNode;
};

/**
 * A strip of tab buttons with the content of the selected one underneath. The selected tab is
 * local state; it resets to the first tab when the first tab's id changes the list.
 *
 * @param props - The tabs in order.
 * @returns The strip and the content.
 */
export function Tabs(props: { tabs: readonly TabDefinition[] }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const current = props.tabs.find((tab) => tab.id === chosen) ?? props.tabs[0];
  return (
    <div>
      <div className="kv-tabs" role="tablist">
        {props.tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === current?.id}
            aria-pressed={tab.id === current?.id}
            onClick={() => {
              setChosen(tab.id);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">{current?.render()}</div>
    </div>
  );
}
