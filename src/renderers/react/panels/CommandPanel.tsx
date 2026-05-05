import React, { useState, useCallback } from "react";
import { useGame } from "../hooks/GameProvider";

/**
 * CommandPanel: issue government commands that affect simulation.
 * Supports pause/resume job boards, diplomatic directives, trade policy.
 */
export function CommandPanel({ onClose }: { onClose: () => void }) {
  const { dispatch, instance } = useGame();
  const [pendingCommands, setPendingCommands] = useState<Array<{ id: number; type: string; description: string; tick: number }>>([]);
  let commandId = 0;

  const issueCommand = useCallback((type: string, payload: Record<string, unknown>, description: string) => {
    dispatch({ type, payload });
    setPendingCommands((prev) => [...prev, { id: ++commandId, type, description, tick: instance.state.tick }]);
  }, [dispatch, instance]);

  const boardIds = [...instance.jobBoards.keys()];
  const boards = boardIds.map((id) => ({
    id,
    board: instance.jobBoards.get(id)!,
  }));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ color: "#e0e0e0", margin: 0 }}>Commands</h3>
        <button onClick={onClose} style={closeButtonStyle}>✕</button>
      </div>

      {/* Job Board Controls */}
      <Section title="Job Boards">
        {boards.map(({ id, board }) => (
          <div key={id} style={rowStyle}>
            <span style={{ textTransform: "capitalize", color: "#ccc" }}>{id}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <StatusBadge active={!board.paused} />
              <button
                onClick={() =>
                  issueCommand(
                    board.paused ? "resume_board" : "pause_board",
                    { boardId: id },
                    `${board.paused ? "Resume" : "Pause"} ${id} board`,
                  )
                }
                style={actionButton}
              >
                {board.paused ? "▶ Resume" : "⏸ Pause"}
              </button>
            </div>
          </div>
        ))}
      </Section>

      {/* Diplomatic Commands */}
      <Section title="Diplomatic Actions">
        <button
          onClick={() => issueCommand("diplomatic", { action: "trade_agreement", factionId: "merchants_guild" }, "Propose trade agreement with Merchants Guild")}
          style={commandButton}
        >
          🤝 Trade Agreement — Merchants Guild
        </button>
        <button
          onClick={() => issueCommand("diplomatic", { action: "alliance", factionId: "church" }, "Propose alliance with The Church")}
          style={commandButton}
        >
          ⛪ Alliance — The Church
        </button>
        <button
          onClick={() => issueCommand("diplomatic", { action: "tax_decree", rate: 0.1 }, "Set tax rate to 10%")}
          style={commandButton}
        >
          💰 Set Tax Rate (10%)
        </button>
      </Section>

      {/* Trade Policy */}
      <Section title="Trade Policy">
        <button
          onClick={() => issueCommand("trade_policy", { policy: "open_market" }, "Open market to all traders")}
          style={commandButton}
        >
          📦 Open Market
        </button>
        <button
          onClick={() => issueCommand("trade_policy", { policy: "embargo", target: "hostile" }, "Embargo hostile factions")}
          style={commandButton}
        >
          🚫 Embargo Hostile Factions
        </button>
      </Section>

      {/* Pending Commands */}
      {pendingCommands.length > 0 && (
        <Section title="Pending Commands">
          {pendingCommands.map((cmd) => (
            <div key={cmd.id} style={pendingRow}>
              <span style={{ color: "#aaa" }}>{cmd.description}</span>
              <span style={{ fontSize: 10, color: "#666" }}>Tick {cmd.tick}</span>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h4 style={sectionHeaderStyle}>{title}</h4>
      {children}
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span style={{ color: active ? "#66bb6a" : "#ff5252", fontSize: 11 }}>
      {active ? "● Active" : "● Paused"}
    </span>
  );
}

const closeButtonStyle: React.CSSProperties = { background: "none", border: "none", color: "#888", fontSize: 18, cursor: "pointer", padding: "4px 8px" };
const sectionHeaderStyle: React.CSSProperties = { color: "#90a4ae", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, borderBottom: "1px solid #2a2a4a", paddingBottom: 4 };
const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #1a1a2e" };
const actionButton: React.CSSProperties = { background: "#2a2a4a", border: "1px solid #3a3a5a", borderRadius: 4, color: "#e0e0e0", padding: "3px 8px", fontSize: 11, cursor: "pointer" };
const commandButton: React.CSSProperties = { display: "block", width: "100%", textAlign: "left", background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 6, color: "#ccc", padding: "8px 12px", fontSize: 12, cursor: "pointer", marginBottom: 6 };
const pendingRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12 };
