import { sidePanels } from "./sidePanels";

/**
 * The column beside the map that holds the registered side panels.
 *
 * @returns The dock.
 */
export function SelectionDock() {
  return (
    <aside className="kv-dock" aria-label="Panels">
      {sidePanels.map((panel) => (
        <section key={panel.id} className="kv-panel" data-panel={panel.id}>
          <h3>{panel.title}</h3>
          <panel.component />
        </section>
      ))}
    </aside>
  );
}
