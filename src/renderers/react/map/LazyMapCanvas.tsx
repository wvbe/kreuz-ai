import { lazy } from "react";

/**
 * The WebGL map canvas loaded on first use with a dynamic `import()`, so three.js and react-three
 * stay out of the first chunk of the app (the Vite chunk-size warning). Render it inside a
 * `Suspense` boundary (`MapViewport` has one); tests that need the real thing await the boundary.
 */
export const LazyMapCanvas = lazy(async () => {
  const loaded = await import("./MapCanvas");
  return { default: loaded.MapCanvas };
});
