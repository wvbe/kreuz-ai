import React, { useState, useMemo } from "react";
import { useGame } from "../hooks/GameProvider.js";
import { getAllEntries, searchEntries, type ContentEntry } from "@game/content/Registry.js";
import type { ContentRegistries } from "@game/content/ContentLoader.js";

type ContentBrowserProps = {
  onClose: () => void;
};

const REGISTRY_TABS = [
  { key: "materials", label: "Materials" },
  { key: "recipes", label: "Recipes" },
  { key: "furniture", label: "Furniture" },
  { key: "zoneTypes", label: "Zones" },
  { key: "skills", label: "Skills" },
  { key: "needs", label: "Needs" },
  { key: "terrain", label: "Terrain" },
  { key: "traits", label: "Traits" },
  { key: "factions", label: "Factions" },
  { key: "entityPrototypes", label: "Entities" },
] as const;

/**
 * Content browser: browse all registries with search and category filtering.
 */
export function ContentBrowser({ onClose }: ContentBrowserProps) {
  const { instance } = useGame();
  const [activeTab, setActiveTab] = useState<string>("materials");
  const [searchQuery, setSearchQuery] = useState("");

  const results = useMemo(() => {
    const registries = instance.content as unknown as Record<string, { entries: Map<string, ContentEntry> }>;
    if (searchQuery.trim()) {
      // Search across all registries
      const allResults: Array<ContentEntry & { registryType: string }> = [];
      for (const tab of REGISTRY_TABS) {
        const registry = registries[tab.key];
        if (!registry) continue;
        const entries = [...registry.entries.values()];
        const matches = entries.filter(
          (entry) =>
            entry.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (entry.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
            entry.id.toLowerCase().includes(searchQuery.toLowerCase()),
        );
        for (const match of matches) {
          allResults.push({ ...match, registryType: tab.key });
        }
      }
      return allResults;
    }
    const registry = registries[activeTab];
    if (!registry) return [];
    return [...registry.entries.values()].map((e) => ({ ...e, registryType: activeTab }));
  }, [instance.content, activeTab, searchQuery]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ color: "#e0e0e0", margin: 0 }}>Content Browser</h3>
        <button onClick={onClose} style={closeButtonStyle}>✕</button>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search all content..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        style={searchInputStyle}
      />

      {/* Tabs */}
      {!searchQuery && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
          {REGISTRY_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                ...tabStyle,
                background: activeTab === tab.key ? "#3a7bd5" : "#2a2a4a",
                color: activeTab === tab.key ? "#fff" : "#888",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>
        {results.length} result{results.length !== 1 ? "s" : ""}
        {searchQuery ? " across all registries" : ""}
      </div>
      <div style={{ maxHeight: "calc(100vh - 280px)", overflowY: "auto" }}>
        {results.map((entry) => (
          <ContentCard key={`${entry.registryType}-${entry.id}`} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function ContentCard({ entry }: { entry: ContentEntry & { registryType: string } }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={cardStyle}
      onClick={() => setExpanded(!expanded)}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 600, color: "#e0e0e0" }}>{entry.name}</span>
        <span style={{ fontSize: 10, color: "#666", textTransform: "capitalize" }}>{entry.registryType}</span>
      </div>
      {entry.description && (
        <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>{entry.description}</div>
      )}
      {expanded && (
        <div style={{ marginTop: 8, fontSize: 11, color: "#aaa", borderTop: "1px solid #2a2a4a", paddingTop: 8 }}>
          <div><strong>ID:</strong> {entry.id}</div>
          {entry.category && <div><strong>Category:</strong> {entry.category}</div>}
          {Object.entries(entry)
            .filter(([key]) => !["id", "name", "description", "category", "registryType"].includes(key))
            .map(([key, value]) => (
              <div key={key}>
                <strong>{key}:</strong> {typeof value === "object" ? JSON.stringify(value) : String(value)}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

const closeButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#888",
  fontSize: 18,
  cursor: "pointer",
  padding: "4px 8px",
};

const searchInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  background: "#1a1a2e",
  border: "1px solid #2a2a4a",
  borderRadius: 6,
  color: "#e0e0e0",
  fontSize: 13,
  marginBottom: 12,
  outline: "none",
};

const tabStyle: React.CSSProperties = {
  padding: "4px 8px",
  border: "none",
  borderRadius: 4,
  fontSize: 11,
  cursor: "pointer",
};

const cardStyle: React.CSSProperties = {
  background: "#1a1a2e",
  border: "1px solid #2a2a4a",
  borderRadius: 6,
  padding: "10px 12px",
  marginBottom: 8,
  cursor: "pointer",
  transition: "border-color 0.2s",
};
