import type { ApiErrorData, CommandResult } from "../../../game/api/CommandResult";
import type { JsonValue } from "../../../game/engine/EventBus";
import type { GameCommand } from "../engine/gameCommands";

/**
 * Errors of a form by field name; the key `""` holds a message that belongs to no field.
 */
export type FieldErrors = { [field: string]: string };

/**
 * What turning a form into a command gives: the command, or the errors to show beside the fields.
 */
export type PayloadResult = { ok: true; command: GameCommand } | { ok: false; errors: FieldErrors };

/**
 * Whether a payload result holds a command.
 *
 * @param result - The result of a builder.
 * @returns True for a command.
 */
export function isCommand(result: PayloadResult): result is { ok: true; command: GameCommand } {
  return result.ok;
}

/**
 * Reads a whole number from a text field.
 *
 * @param text - The field's text.
 * @returns The number, or null for empty, negative, fractional or non-numeric text.
 */
export function parseWhole(text: string): number | null {
  return /^\d{1,9}$/.test(text.trim()) ? Number(text.trim()) : null;
}

/**
 * Splits the `issues` of an invalid-payload error (`"field: message"`) into field errors; any
 * other error becomes one general message under the key `""`.
 *
 * @param error - The structured error of a command result.
 * @returns The errors by field.
 */
export function fieldErrorsOfError(error: ApiErrorData): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues ?? []) {
    const split = issue.indexOf(": ");
    if (split > 0) {
      errors[issue.slice(0, split)] = issue.slice(split + 2);
    }
  }
  if (Object.keys(errors).length === 0) {
    errors[""] = error.message;
  }
  return errors;
}

/**
 * The field errors of a command result (empty for a success).
 *
 * @param result - What `host.commands.send` returned.
 * @returns The errors by field.
 */
export function fieldErrorsOf(result: CommandResult): FieldErrors {
  return result.ok ? {} : fieldErrorsOfError(result.error);
}

function done(kind: string, fields: { [name: string]: JsonValue | undefined }): PayloadResult {
  const command: { kind: string; [name: string]: JsonValue } = { kind };
  for (const [name, value] of Object.entries(fields)) {
    if (value !== undefined) {
      command[name] = value;
    }
  }
  return { ok: true, command };
}

function failed(errors: FieldErrors): PayloadResult {
  return { ok: false, errors };
}

function optionalWhole(
  text: string | undefined,
  field: string,
  errors: FieldErrors,
): number | undefined {
  if (text === undefined || text.trim() === "") {
    return undefined;
  }
  const value = parseWhole(text);
  if (value === null) {
    errors[field] = "Enter a whole number";
    return undefined;
  }
  return value;
}

function requiredWhole(
  text: string | undefined,
  field: string,
  errors: FieldErrors,
  min = 0,
): number {
  const value = text === undefined ? null : parseWhole(text);
  if (value === null) {
    errors[field] = "Enter a whole number";
    return 0;
  }
  if (value < min) {
    errors[field] = `Must be at least ${min}`;
  }
  return value;
}

/**
 * The text fields of the standing-order form ("Keep in stock...").
 */
export type StandingOrderForm = {
  materialId: string;
  recipeId: string;
  target: string;
  threshold: string;
  priority: string;
  zoneId: string;
  boardId: string;
};

/**
 * Builds `CreateStandingOrder` from the form.
 *
 * @param form - The text fields; empty optional fields are left out.
 * @returns The command or the field errors.
 */
export function standingOrderCommand(form: StandingOrderForm): PayloadResult {
  const errors: FieldErrors = {};
  if (form.materialId.trim() === "") {
    errors["materialId"] = "Choose a material";
  }
  const target = requiredWhole(form.target, "targetQuantity", errors, 1);
  const threshold = optionalWhole(form.threshold, "restockThreshold", errors);
  const priority = optionalWhole(form.priority, "priority", errors);
  const zoneId = optionalWhole(form.zoneId, "scope", errors);
  const boardId = optionalWhole(form.boardId, "postingBoardId", errors);
  if (Object.keys(errors).length > 0) {
    return failed(errors);
  }
  return done("CreateStandingOrder", {
    materialId: form.materialId.trim(),
    recipeId: form.recipeId === "" ? undefined : form.recipeId,
    targetQuantity: target,
    restockThreshold: threshold,
    priority,
    scope: zoneId === undefined ? undefined : { zoneId },
    postingBoardId: boardId,
  });
}

/**
 * The fields of the production-order form.
 */
export type ProductionOrderForm = {
  workstationId: string;
  recipeId: string;
  quantity: string;
  priority: string;
};

/**
 * Builds `CreateProductionOrder` from the form.
 *
 * @param form - The text fields.
 * @returns The command or the field errors.
 */
export function productionOrderCommand(form: ProductionOrderForm): PayloadResult {
  const errors: FieldErrors = {};
  if (form.recipeId === "") {
    errors["recipeId"] = "Choose a recipe";
  }
  const workstationId = requiredWhole(form.workstationId, "workstationId", errors, 1);
  const quantity = requiredWhole(form.quantity, "quantity", errors, 1);
  const priority = optionalWhole(form.priority, "priority", errors);
  if (Object.keys(errors).length > 0) {
    return failed(errors);
  }
  return done("CreateProductionOrder", {
    recipeId: form.recipeId,
    workstationId,
    quantity,
    priority,
  });
}

/**
 * The fields of the custom-job form of a user-managed board.
 */
export type CustomJobForm = {
  boardId: number;
  jobTypeId: string;
  mapId: number;
  cell: string;
  priority: string;
  wage: string;
  /**
   * True for a board that takes postings at once (`PostCustomJob`); false for a user-managed
   * board whose postings a Town Crier carries (`PostJob`).
   */
  direct: boolean;
};

/**
 * Builds `PostJob` (a Town Crier carries the posting to a user-managed board) or `PostCustomJob`
 * (a posting at once) from the form.
 *
 * @param form - The text fields.
 * @returns The command or the field errors.
 */
export function customJobCommand(form: CustomJobForm): PayloadResult {
  const errors: FieldErrors = {};
  if (form.jobTypeId.trim() === "") {
    errors["jobTypeId"] = "Enter a job type";
  }
  const cellIndex = requiredWhole(form.cell, "cellIndex", errors);
  const priority = optionalWhole(form.priority, "priority", errors);
  const wage = optionalWhole(form.wage, "wage", errors);
  if (Object.keys(errors).length > 0) {
    return failed(errors);
  }
  return done(form.direct ? "PostCustomJob" : "PostJob", {
    boardId: form.boardId,
    jobTypeId: form.jobTypeId.trim(),
    mapId: form.mapId,
    cellIndex,
    priority,
    wage,
  });
}

/**
 * The fields of the gift form.
 */
export type GiftForm = {
  factionId: number;
  coins: string;
  materialId: string;
  quantity: string;
};

/**
 * Builds `IssueDiplomaticAct` for a gift: coins, goods or both (coins and goods go in one
 * envoy).
 *
 * @param form - The text fields.
 * @returns The command or the field errors.
 */
export function giftCommand(form: GiftForm): PayloadResult {
  const errors: FieldErrors = {};
  const coins = optionalWhole(form.coins, "coins", errors) ?? 0;
  const quantity = optionalWhole(form.quantity, "quantity", errors) ?? 0;
  const material = form.materialId.trim();
  if (quantity > 0 && material === "") {
    errors["materialId"] = "Name the goods to send";
  }
  if (material !== "" && quantity === 0) {
    errors["quantity"] = "Enter how many";
  }
  if (coins === 0 && quantity === 0 && Object.keys(errors).length === 0) {
    errors["coins"] = "Send coins or goods";
  }
  if (Object.keys(errors).length > 0) {
    return failed(errors);
  }
  const items = quantity > 0 ? [{ materialId: material, quantity }] : [];
  return done("IssueDiplomaticAct", {
    actType: "gift",
    targetFactionId: form.factionId,
    gift: { coins, items },
  });
}

/**
 * The acts an envoy can carry besides a gift (the values the CLI `envoy` verb offers).
 */
export enum EnvoyAct {
  TradeAgreement = "agreement",
  Overture = "overture",
  War = "war",
  Peace = "peace",
  Neutrality = "neutrality",
}

/**
 * Builds `IssueDiplomaticAct` for an agreement, an overture or a declaration.
 *
 * @param factionId - The faction to send the envoy to.
 * @param act - What the envoy carries.
 * @returns The command.
 */
export function envoyCommand(factionId: number, act: EnvoyAct): PayloadResult {
  if (act === EnvoyAct.TradeAgreement || act === EnvoyAct.Overture) {
    return done("IssueDiplomaticAct", {
      actType: act === EnvoyAct.TradeAgreement ? "trade-agreement" : "overture",
      targetFactionId: factionId,
    });
  }
  return done("IssueDiplomaticAct", {
    actType: "declaration",
    targetFactionId: factionId,
    declaration: act,
  });
}

/**
 * Which way goods go in a trade; the values are the `direction` of the `trade-quote` query.
 */
export enum TradeSide {
  Sell = "Sell",
  Buy = "Buy",
}

/**
 * The fields of a trade form.
 */
export type TradeForm = {
  side: TradeSide;
  traderId: string;
  materialId: string;
  quantity: string;
};

/**
 * Builds `TradeSell` or `TradeBuy` from the form.
 *
 * @param form - The text fields.
 * @returns The command or the field errors.
 */
export function tradeCommand(form: TradeForm): PayloadResult {
  const errors: FieldErrors = {};
  const traderId = requiredWhole(form.traderId, "traderId", errors, 1);
  const quantity = requiredWhole(form.quantity, "quantity", errors, 1);
  if (form.materialId.trim() === "") {
    errors["materialId"] = "Choose goods";
  }
  if (Object.keys(errors).length > 0) {
    return failed(errors);
  }
  return done(form.side === TradeSide.Sell ? "TradeSell" : "TradeBuy", {
    traderId,
    materialId: form.materialId.trim(),
    quantity,
  });
}
