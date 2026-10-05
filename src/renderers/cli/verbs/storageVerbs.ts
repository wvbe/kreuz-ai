import { formatStockMaterial, formatStockOverview, formatStockpiles } from "../formatStock";
import { verbDone, verbFailed } from "./Verb";
import type { Verb } from "./Verb";

/**
 * Storage verbs: `stock`.
 */
export const storageVerbs: readonly Verb[] = [
  {
    name: "stock",
    usage: "stock [materialId]",
    summary:
      "show what the storages hold (totals, reserved, room) and the stockpiles; one material in detail when given",
    run: (args, { session }) => {
      if (args.length > 1) {
        return verbFailed("usage: stock [materialId]");
      }
      const materialId = args[0];
      if (materialId !== undefined) {
        const view = session.query.run("stock", { materialId });
        return view.ok ? verbDone(formatStockMaterial(view.data)) : verbFailed(view.error.message);
      }
      const overview = session.query.run("stock", {});
      const stockpiles = session.query.run("stockpiles", {});
      if (!overview.ok || !stockpiles.ok) {
        return verbFailed("the storage is not available (no game?)");
      }
      return verbDone([
        ...formatStockOverview(overview.data),
        "stockpiles:",
        ...formatStockpiles(stockpiles.data),
      ]);
    },
  },
];
