import React, { useState, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { GameProvider, useGame } from "./hooks/GameProvider";
import { MapView } from "./map/MapView";
import { InspectionPanel } from "./panels/InspectionPanel";
import { ContentBrowser } from "./panels/ContentBrowser";
import { CommandPanel } from "./panels/CommandPanel";
import { BuildMenu } from "./tools/BuildMenu";
import { ZoneDrawer } from "./tools/ZoneDrawer";
import { Toolbar } from "./ui/Toolbar";
import { SaveLoadControls } from "./ui/SaveLoadControls";

type PanelType = "inspection" | "content" | "commands" | "build" | "zones" | null;

/**
 * Root application component.
 */
export function App() {
  return (
    <GameProvider seed={Date.now()}>
      <GameUI />
    </GameProvider>
  );
}

function GameUI() {
  const { tick, paused, speed, togglePause, setSpeed } = useGame();
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);
  const [activePanel, setActivePanel] = useState<PanelType>("inspection");

  const handleEntitySelect = useCallback((entityId: number | null) => {
    setSelectedEntityId(entityId);
    if (entityId !== null) setActivePanel("inspection");
  }, []);

  const togglePanel = useCallback((panel: PanelType) => {
    setActivePanel((current) => (current === panel ? null : panel));
  }, []);

  return (
    <div style={{ display: "flex", width: "100vw", height: "100vh", flexDirection: "column" }}>
      {/* Top toolbar */}
      <Toolbar
        tick={tick}
        paused={paused}
        speed={speed}
        onTogglePause={togglePause}
        onSetSpeed={setSpeed}
        onOpenContent={() => togglePanel("content")}
      />

      {/* Main content */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left tool bar */}
        <div style={leftToolbarStyle}>
          <ToolButton icon="🔍" label="Inspect" active={activePanel === "inspection"} onClick={() => togglePanel("inspection")} />
          <ToolButton icon="📜" label="Commands" active={activePanel === "commands"} onClick={() => togglePanel("commands")} />
          <ToolButton icon="🔨" label="Build" active={activePanel === "build"} onClick={() => togglePanel("build")} />
          <ToolButton icon="🗺️" label="Zones" active={activePanel === "zones"} onClick={() => togglePanel("zones")} />
          <ToolButton icon="📖" label="Content" active={activePanel === "content"} onClick={() => togglePanel("content")} />
          <div style={{ marginTop: "auto" }}>
            <SaveLoadControls />
          </div>
        </div>

        {/* 3D Map Canvas */}
        <div style={{ flex: 1, position: "relative" }}>
          <Canvas
            orthographic
            camera={{ zoom: 8, position: [100, 100, 100], near: 0.1, far: 1000 }}
            style={{ background: "#0a0a1a" }}
          >
            <ambientLight intensity={0.6} />
            <directionalLight position={[50, 80, 50]} intensity={0.8} castShadow />
            <hemisphereLight args={["#4488cc", "#2d1b00", 0.3]} />
            <fog attach="fog" args={["#0a0a1a", 150, 300]} />
            <MapView
              selectedEntityId={selectedEntityId}
              onSelectEntity={handleEntitySelect}
            />
          </Canvas>

          {/* Overlay: game stats */}
          <div style={{
            position: "absolute",
            bottom: 10,
            left: 10,
            background: "rgba(0,0,0,0.7)",
            padding: "8px 12px",
            borderRadius: 6,
            fontSize: 12,
            color: "#aaa",
          }}>
            Tick: {tick} | {paused ? "⏸ PAUSED" : `▶ ${speed}x`}
          </div>
        </div>

        {/* Side panel */}
        {activePanel && (
          <div style={{
            width: 380,
            background: "#16213e",
            borderLeft: "1px solid #2a2a4a",
            overflowY: "auto",
            padding: 16,
            flexShrink: 0,
          }}>
            {activePanel === "inspection" && (
              <InspectionPanel
                entityId={selectedEntityId}
                onSelectEntity={handleEntitySelect}
                onClose={() => setActivePanel(null)}
              />
            )}
            {activePanel === "content" && (
              <ContentBrowser onClose={() => setActivePanel(null)} />
            )}
            {activePanel === "commands" && (
              <CommandPanel onClose={() => setActivePanel(null)} />
            )}
            {activePanel === "build" && (
              <BuildMenu
                onClose={() => setActivePanel(null)}
                onPlaceFurniture={(id) => { /* TODO: activate placement tool */ }}
              />
            )}
            {activePanel === "zones" && (
              <ZoneDrawer
                onClose={() => setActivePanel(null)}
                onDrawZone={(id) => { /* TODO: activate zone draw tool */ }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolButton({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        background: active ? "#3a7bd5" : "transparent",
        border: "none",
        borderRadius: 6,
        color: active ? "#fff" : "#888",
        padding: "8px 6px",
        fontSize: 18,
        cursor: "pointer",
        width: 52,
      }}
    >
      <span>{icon}</span>
      <span style={{ fontSize: 9 }}>{label}</span>
    </button>
  );
}

const leftToolbarStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  width: 56,
  background: "#0d1b2a",
  borderRight: "1px solid #1a2a4a",
  padding: "8px 0",
  gap: 4,
  flexShrink: 0,
};
