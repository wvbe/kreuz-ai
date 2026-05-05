import React, { useState, useMemo } from "react";
import { useGame } from "../hooks/GameProvider";
import { type TileMap, TerrainType, type Cell } from "@game/map/TileMap";

type BuildMenuProps = {
  onClose: () => void;
  onPlaceFurniture: (furnitureId: string) => void;
};

/**
 * BuildMenu: list furniture types from registry for placement.
 */
export function BuildMenu({ onClose, onPlaceFurniture }: BuildMenuProps) {
  const { instance } = useGame();
  const [category, setCategory] = useState<string>("all");

  const furniture = useMemo(() => {
    const registry = instance.content.furniture;
    return [...registry.entries.values()];
  }, [instance.content]);

  const categories = useMemo(() => {
    const cats = new Set(furniture.map((f) => f.category ?? "misc"));
    return ["all", ...cats];
  }, [furniture]);

  const filtered = useMemo(() => {
    if (category === "all") return furniture;
    return furniture.filter((f) => (f.category ?? "misc") === category);
  }, [furniture, category]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ color: "#e0e0e0", margin: 0 }}>Build</h3>
        <button onClick={onClose} style={closeBtn}>✕</button>
      </div>

      {/* Category filter */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            style={{
              ...catBtn,
              background: category === cat ? "#3a7bd5" : "#2a2a4a",
              color: category === cat ? "#fff" : "#888",
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Furniture list */}
      <div style={{ maxHeight: "calc(100vh - 260px)", overflowY: "auto" }}>
        {filtered.map((item) => (
          <div key={item.id} style={furnitureCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontWeight: 600, color: "#e0e0e0" }}>{item.name}</span>
                {item.description && (
                  <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{item.description}</div>
                )}
              </div>
              <button
                onClick={() => onPlaceFurniture(item.id)}
                style={placeBtn}
              >
                Place
              </button>
            </div>
            {item.materials && (
              <div style={{ marginTop: 6, fontSize: 11, color: "#666" }}>
                Materials: {(item.materials as Array<{ materialId: string; quantity: number }>).map((m) => `${m.materialId} ×${m.quantity}`).join(", ")}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const closeBtn: React.CSSProperties = { background: "none", border: "none", color: "#888", fontSize: 18, cursor: "pointer", padding: "4px 8px" };
const catBtn: React.CSSProperties = { padding: "4px 8px", border: "none", borderRadius: 4, fontSize: 11, cursor: "pointer" };
const furnitureCard: React.CSSProperties = { background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 6, padding: "10px 12px", marginBottom: 6 };
const placeBtn: React.CSSProperties = { background: "#3a7bd5", border: "none", borderRadius: 4, color: "#fff", padding: "4px 10px", fontSize: 11, cursor: "pointer" };
