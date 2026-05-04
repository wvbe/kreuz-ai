import React from "react";

type GameControlsProps = {
  paused: boolean;
  speed: number;
  onTogglePause: () => void;
  onSetSpeed: (speed: number) => void;
};

/**
 * Game speed controls: play/pause and speed buttons.
 */
export function GameControls({ paused, speed, onTogglePause, onSetSpeed }: GameControlsProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button onClick={onTogglePause} style={controlButton}>
        {paused ? "▶" : "⏸"}
      </button>
      {[1, 2, 5, 10].map((speedValue) => (
        <button
          key={speedValue}
          onClick={() => onSetSpeed(speedValue)}
          style={{
            ...controlButton,
            background: speed === speedValue ? "#3a7bd5" : "#2a2a4a",
            color: speed === speedValue ? "#fff" : "#aaa",
          }}
        >
          {speedValue}×
        </button>
      ))}
    </div>
  );
}

const controlButton: React.CSSProperties = {
  background: "#2a2a4a",
  border: "1px solid #3a3a5a",
  borderRadius: 4,
  color: "#e0e0e0",
  padding: "4px 10px",
  fontSize: 12,
  cursor: "pointer",
  minWidth: 32,
};
