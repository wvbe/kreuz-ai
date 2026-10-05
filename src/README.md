# src

All source code. Two trees with a one-way dependency (spec 023 FR-017/FR-018):

- [game](game/README.md) - the headless deterministic engine. No DOM, no wall clock, no `Math.random`.
- [renderers](renderers/README.md) - front-ends that consume the engine. They may import `game`; `game` must never import them.
