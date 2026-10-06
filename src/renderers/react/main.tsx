import { createRoot } from "react-dom/client";
import { App } from "./App";
import { EngineHost } from "./engine/EngineHost";
import { MapCanvas } from "./map/MapCanvas";
import { downloadTextFile } from "./ui/downloadTextFile";
import "./app.css";

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const container = document.getElementById("root");
if (container) {
  const host = new EngineHost({ storage: browserStorage() });
  createRoot(container).render(
    <App host={host} services={{ mapCanvas: MapCanvas, downloadText: downloadTextFile }} />,
  );
}
