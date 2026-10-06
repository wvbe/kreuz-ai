import { SettlementProgressPanel } from "./SettlementProgressPanel";
import "./views.css";

/**
 * The Settlement screen: the progress panel at full width.
 *
 * @returns The screen.
 */
export function SettlementScreen() {
  return (
    <section className="kv-screen kv-view">
      <h2>Settlement</h2>
      <SettlementProgressPanel />
    </section>
  );
}
