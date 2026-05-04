import React, { useState, useMemo } from "react";
import { useGame } from "../hooks/GameProvider.js";

type ZoneDrawerProps = {
  onClose: () => void;
  onDrawZone: (zoneType: string) => void;
};

/**
 * ZoneDrawer: select zone type and paint cells to define zones.
 */
export function ZoneDrawer({ onClose, onDrawZone }: ZoneDrawerProps) {
  const { instance } = useGame();
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const zoneTypes = useMemo(() => {
    const registry = instance.content.zoneTypes;
    return [...registry.entries.values()];
  }, [instance.content]);

  const categories = useMemo(() => {
    const cats = new Set(zoneTypes.map((z) => z.category ?? "misc"));
    return [...cats];
  }, [zoneTypes]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ color: "#e0e0e0", margin: 0 }}>Zones</h3>
        <button onClick={onClose} style={closeBtn}>✕</button>
      </div>

      {isDrawing && selectedType ? (
        <div>
          <div style={drawingIndicator}>
            <span>🎨 Drawing: <strong>{selectedType}</strong></span>
            <button onClick={() => setIsDrawing(false)} style={stopBtn}>Done</button>
          </div>
          <p style={{ color: "#888", fontSize: 12 }}>
            Click and drag on the map to paint zone cells.
          </p>
        </div>
      ) : (
        <div>
          <p style={{ color: "#888", fontSize: 12, marginBottom: 12 }}>
            Select a zone type, then paint cells on the map.
          </p>

          {categories.map((category) => (
            <div key={category} style={{ marginBottom: 12 }}>
              <h4 style={catHeader}>{category}</h4>
              {zoneTypes
                .filter((z) => (z.category ?? "misc") === category)
                .map((zone) => (
                  <div key={zone.id} style={zoneCard}>
                    <div>
                      <span style={{ fontWeight: 600, color: "#e0e0e0" }}>{zone.name}</span>
                      {zone.description && (
                        <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{zone.description}</div>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setSelectedType(zone.id);
                        setIsDrawing(true);
                        onDrawZone(zone.id);
                      }}
                      style={drawBtn}
                    >
                      Draw
                    </button>
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const closeBtn: React.CSSProperties = { background: "none", border: "none", color: "#888", fontSize: 18, cursor: "pointer", padding: "4px 8px" };
const catHeader: React.CSSProperties = { color: "#90a4ae", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 };
const zoneCard: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 6, padding: "8px 12px", marginBottom: 4 };
const drawBtn: React.CSSProperties = { background: "#66bb6a", border: "none", borderRadius: 4, color: "#fff", padding: "4px 10px", fontSize: 11, cursor: "pointer" };
const drawingIndicator: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#1b5e20", border: "1px solid #2e7d32", borderRadius: 6, padding: "8px 12px", marginBottom: 8, color: "#c8e6c9" };
const stopBtn: React.CSSProperties = { background: "#c62828", border: "none", borderRadius: 4, color: "#fff", padding: "4px 10px", fontSize: 11, cursor: "pointer" };
