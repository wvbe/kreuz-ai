# src/renderers

Front-ends. Each subfolder is one renderer; siblings do not depend on each other. Renderers drive the engine only
through its command/query facade (`GameSession`, plan task 1.9) and may import `src/game`.

- [react](react/README.md) - React renderer (spec 024). A placeholder for now.

A terminal/JSONL renderer (`cli`) joins in plan task 1.10.
