# src/renderers/react

The browser renderer (spec 024), built by `vite build` from the repo-root `index.html`.

- `main.tsx` - browser entry point.
- `App.tsx` - placeholder root component; the real UI arrives in plan phase 6.

Depends on `src/game` only through the `GameSession` facade once it exists.
