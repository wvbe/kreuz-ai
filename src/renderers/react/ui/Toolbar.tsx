import React from "react";
import { useGame } from "../hooks/GameProvider";
import { GameControls } from "./GameControls";
import { getEntitiesByTag } from "@game/engine/EntityManager";

type ToolbarProps = {
  tick: number;
  paused: boolean;
  speed: number;
  onTogglePause: () => void;
  onSetSpeed: (speed: number) => void;
  onOpenContent: () => void;
};

/**
 * Top toolbar with game info, controls, and navigation.
 */
export function Toolbar({ tick, paused, speed, onTogglePause, onSetSpeed, onOpenContent }: ToolbarProps) {
  const { instance } = useGame();
  const colonistCount = getEntitiesByTag(instance.state.entities, "colonist").length;
  const animalCount = getEntitiesByTag(instance.state.entities, "animal").length;

  return (
    <div style={toolbarStyle}>
      {/* Left: Game title and stats */}
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <h1 style={{ fontSize: 16, fontWeight: 700, color: "#e0e0e0", margin: 0 }}>
          ⚔️ Kreuzvibe
        </h1>
        <div style={statBadge}>
          <span style={{ color: "#ff6b6b" }}>●</span> {colonistCount} colonists
        </div>
        <div style={statBadge}>
          <span style={{ color: "#66bb6a" }}>●</span> {animalCount} animals
        </div>
        <div style={statBadge}>
          Day {Math.floor(tick / 100) + 1}, Hour {Math.floor((tick % 100) / 4)}
        </div>
      </div>

      {/* Center: Game controls */}
      <GameControls
        paused={paused}
        speed={speed}
        onTogglePause={onTogglePause}
        onSetSpeed={onSetSpeed}
      />

      {/* Right: Navigation */}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onOpenContent} style={navButton}>
          📖 Content
        </button>
      </div>
    </div>
  );
}

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 16px",
  background: "#0f3460",
  borderBottom: "1px solid #1a4080",
  height: 48,
  flexShrink: 0,
};

const statBadge: React.CSSProperties = {
  fontSize: 12,
  color: "#aaa",
  display: "flex",
  alignItems: "center",
  gap: 4,
};

const navButton: React.CSSProperties = {
  background: "#2a2a4a",
  border: "1px solid #3a3a5a",
  borderRadius: 6,
  color: "#e0e0e0",
  padding: "4px 12px",
  fontSize: 12,
  cursor: "pointer",
};
