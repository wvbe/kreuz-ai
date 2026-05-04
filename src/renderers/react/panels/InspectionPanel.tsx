import React from "react";
import { useGame } from "../hooks/GameProvider.js";
import { getComponent, hasTag, getEntitiesByTag } from "@game/engine/EntityManager.js";
import type { NeedsComponent } from "@game/systems/NeedSystem.js";
import type { SkillsComponent } from "@game/systems/SkillSystem.js";
import type { InventoryComponent } from "@game/systems/InventorySystem.js";

type InspectionPanelProps = {
  entityId: number | null;
  onSelectEntity: (entityId: number | null) => void;
  onClose: () => void;
};

/**
 * Inspection panel showing all live state for a selected entity.
 */
export function InspectionPanel({ entityId, onSelectEntity, onClose }: InspectionPanelProps) {
  const { instance, tick } = useGame();

  if (entityId === null) {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ color: "#e0e0e0", margin: 0 }}>Inspector</h3>
          <button onClick={onClose} style={closeButtonStyle}>✕</button>
        </div>
        <p style={{ color: "#888" }}>Click an entity on the map to inspect it.</p>
        <EntityList onSelectEntity={onSelectEntity} />
      </div>
    );
  }

  const identity = getComponent(instance.state.entities, entityId, "identity") as Record<string, unknown> | undefined;
  const position = getComponent(instance.state.entities, entityId, "position") as Record<string, unknown> | undefined;
  const health = getComponent(instance.state.entities, entityId, "health") as { current: number; max: number } | undefined;
  const needs = getComponent(instance.state.entities, entityId, "needs") as NeedsComponent | undefined;
  const skills = getComponent(instance.state.entities, entityId, "skills") as SkillsComponent | undefined;
  const inventory = getComponent(instance.state.entities, entityId, "inventory") as InventoryComponent | undefined;
  const isColonist = hasTag(instance.state.entities, entityId, "colonist");
  const isAnimal = hasTag(instance.state.entities, entityId, "animal");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ color: "#e0e0e0", margin: 0 }}>
          {(identity?.name as string) ?? `Entity #${entityId}`}
        </h3>
        <button onClick={onClose} style={closeButtonStyle}>✕</button>
      </div>

      {/* Type badge */}
      <div style={{ marginBottom: 12 }}>
        {isColonist && <span style={badgeStyle("#ff6b6b")}>Colonist</span>}
        {isAnimal && <span style={badgeStyle("#66bb6a")}>Animal</span>}
        {identity?.profession && (
          <span style={badgeStyle("#64b5f6")}>{identity.profession as string}</span>
        )}
      </div>

      {/* Position */}
      {position && (
        <Section title="Position">
          <div style={statRow}>
            <span>Map:</span> <span>{position.mapId as string}</span>
          </div>
          <div style={statRow}>
            <span>Cell:</span> <span>{position.cellId as number}</span>
          </div>
        </Section>
      )}

      {/* Health */}
      {health && (
        <Section title="Health">
          <ProgressBar
            value={health.current}
            max={health.max}
            color="#ef5350"
            label={`${health.current}/${health.max}`}
          />
        </Section>
      )}

      {/* Needs */}
      {needs && (
        <Section title="Needs">
          {needs.needs.map((need) => (
            <div key={need.needId} style={{ marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ textTransform: "capitalize" }}>{need.needId}</span>
                <span>{Math.round(need.value * 100)}%</span>
              </div>
              <ProgressBar
                value={need.value}
                max={1}
                color={need.value < need.urgencyThreshold ? "#ff5252" : need.value < 0.5 ? "#ffa726" : "#66bb6a"}
              />
            </div>
          ))}
        </Section>
      )}

      {/* Skills */}
      {skills && (
        <Section title="Skills">
          {[...skills.skills.entries()].map(([skillId, skill]) => (
            <div key={skillId} style={statRow}>
              <span style={{ textTransform: "capitalize" }}>{skillId}</span>
              <span>Lv. {skill.level} ({Math.round((skill.experience / skill.experienceToNext) * 100)}%)</span>
            </div>
          ))}
        </Section>
      )}

      {/* Inventory */}
      {inventory && (
        <Section title={`Inventory (${inventory.currentWeight}/${inventory.capacity})`}>
          {inventory.items.length === 0 ? (
            <span style={{ color: "#666", fontSize: 12 }}>Empty</span>
          ) : (
            inventory.items.map((item) => (
              <div key={item.materialId} style={statRow}>
                <span style={{ textTransform: "capitalize" }}>{item.materialId.replace(/_/g, " ")}</span>
                <span>×{item.quantity}</span>
              </div>
            ))
          )}
        </Section>
      )}
    </div>
  );
}

function EntityList({ onSelectEntity }: { onSelectEntity: (id: number) => void }) {
  const { instance } = useGame();
  const colonists = getEntitiesByTag(instance.state.entities, "colonist");

  return (
    <Section title={`Colonists (${colonists.length})`}>
      {colonists.map((entityId) => {
        const identity = getComponent(instance.state.entities, entityId, "identity") as Record<string, unknown> | undefined;
        return (
          <div
            key={entityId}
            onClick={() => onSelectEntity(entityId)}
            style={{ ...statRow, cursor: "pointer", padding: "4px 6px", borderRadius: 4, ":hover": { background: "#2a2a4a" } }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#2a2a4a")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <span style={{ color: "#ff6b6b" }}>●</span>
            <span>{(identity?.name as string) ?? `Colonist #${entityId}`}</span>
          </div>
        );
      })}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h4 style={{ color: "#90a4ae", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, borderBottom: "1px solid #2a2a4a", paddingBottom: 4 }}>
        {title}
      </h4>
      {children}
    </div>
  );
}

function ProgressBar({ value, max, color, label }: { value: number; max: number; color: string; label?: string }) {
  const percent = Math.round((value / max) * 100);
  return (
    <div style={{ background: "#1a1a2e", borderRadius: 3, height: 8, overflow: "hidden", position: "relative" }}>
      <div style={{ width: `${percent}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.3s" }} />
      {label && (
        <span style={{ position: "absolute", right: 4, top: -1, fontSize: 8, color: "#aaa" }}>{label}</span>
      )}
    </div>
  );
}

const statRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 13,
  padding: "2px 0",
  color: "#ccc",
};

const closeButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#888",
  fontSize: 18,
  cursor: "pointer",
  padding: "4px 8px",
};

function badgeStyle(color: string): React.CSSProperties {
  return {
    background: color + "22",
    color,
    border: `1px solid ${color}44`,
    borderRadius: 4,
    padding: "2px 8px",
    fontSize: 11,
    marginRight: 6,
  };
}
