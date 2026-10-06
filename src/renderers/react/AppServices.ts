import { createContext, useContext } from "react";
import type { ComponentType } from "react";
import type { MapCanvasProps } from "./map/MapCanvasProps";

/**
 * Things the shell needs from the outside world that tests replace: the WebGL canvas (jsdom has
 * no WebGL) and the file download.
 */
export type AppServices = {
  /**
   * Draws the map scene; the real one wraps three.js (`map/MapCanvas`).
   */
  mapCanvas: ComponentType<MapCanvasProps>;
  /**
   * Offers a text as a file download.
   */
  downloadText: (fileName: string, text: string) => void;
};

/**
 * Context of the {@link AppServices}.
 */
export const appServicesContext = createContext<AppServices | null>(null);

/**
 * The services of the surrounding `App`.
 *
 * @returns The services.
 * @throws {Error} When rendered outside an `App`.
 */
export function useAppServices(): AppServices {
  const services = useContext(appServicesContext);
  if (services === null) {
    throw new Error("useAppServices needs the App above it");
  }
  return services;
}
