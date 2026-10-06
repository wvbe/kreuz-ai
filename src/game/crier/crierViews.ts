import { getComponent } from "../ecs/Entity";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { positionComponent } from "../map/positionComponent";
import { listCriers, tripToBoard } from "./crierQueries";
import { getCrierService } from "./crierServiceRegistry";
import { CrierStatus } from "./crierTypes";
import type { BoardChange } from "./crierTypes";
import { townCrierComponent } from "./townCrierComponent";

/**
 * Where a pending update is: waiting for a crier, or on the way.
 */
export enum PendingUpdateState {
  Queued = "queued",
  Carried = "carried",
}

/**
 * Why a queued update has not left yet.
 */
export enum WaitingReason {
  /**
   * The colony has no Town Crier at all (appoint one).
   */
  NoTownCrier = "NoTownCrier",
  /**
   * Every crier is out delivering something else.
   */
  AllCriersBusy = "AllCriersBusy",
  /**
   * A crier is free but cannot reach the board.
   */
  BoardUnreachable = "BoardUnreachable",
}

/**
 * One pending board update (query `pending-updates`): a player change that a crier has not
 * delivered yet, with its progress.
 */
export type PendingUpdateView = {
  readonly updateId: number;
  readonly boardId: EntityId;
  readonly origin: string;
  readonly createdTick: number;
  readonly changes: readonly BoardChange[];
  readonly state: PendingUpdateState;
  /**
   * The carrying crier, or null while queued.
   */
  readonly crierId: EntityId | null;
  /**
   * Ticks until the crier arrives at its present speed and position, or null while queued.
   */
  readonly etaTicks: number | null;
  /**
   * Path cost still to walk, or null while queued.
   */
  readonly remainingCost: number | null;
  /**
   * Share of the walk done, `0..1000` permille (0 while queued).
   */
  readonly progressPermille: number;
  /**
   * Why a queued update waits, null once carried.
   */
  readonly waitingFor: WaitingReason | null;
};

/**
 * One Town Crier (query `town-criers`).
 */
export type TownCrierView = {
  readonly crierId: EntityId;
  readonly status: CrierStatus;
  readonly mapId: number | null;
  readonly cellIndex: number | null;
  readonly boardQueue: readonly EntityId[];
  readonly carrying: readonly number[];
};

function waitingReasonOf(engine: GameEngine, boardId: EntityId): WaitingReason {
  const criers = listCriers(engine);
  if (criers.length === 0) {
    return WaitingReason.NoTownCrier;
  }
  const free = criers.filter(
    (crier) => getComponent(crier, townCrierComponent)?.status === CrierStatus.Available,
  );
  if (free.length === 0) {
    return WaitingReason.AllCriersBusy;
  }
  return free.some((crier) => tripToBoard(engine, crier, boardId) !== null)
    ? WaitingReason.AllCriersBusy
    : WaitingReason.BoardUnreachable;
}

/**
 * Lists the pending board updates, ascending by id, with crier, ETA and progress (query
 * `pending-updates`, spec 017 US6.2).
 *
 * @param engine - The engine.
 * @returns One view per update that was not delivered, applied or cancelled yet.
 */
export function buildPendingUpdateViews(engine: GameEngine): PendingUpdateView[] {
  return getCrierService(engine)
    .updates()
    .map((update) => {
      const crier = update.crierId === null ? undefined : engine.store.get(update.crierId);
      const trip = crier === undefined ? null : tripToBoard(engine, crier, update.boardId);
      const done =
        trip === null || update.startCost === 0
          ? 0
          : Math.max(
              0,
              Math.min(
                1000,
                Math.floor(((update.startCost - trip.cost) * 1000) / update.startCost),
              ),
            );
      return {
        updateId: update.updateId,
        boardId: update.boardId,
        origin: update.origin,
        createdTick: update.createdTick,
        changes: update.changes,
        state: update.crierId === null ? PendingUpdateState.Queued : PendingUpdateState.Carried,
        crierId: update.crierId,
        etaTicks: trip === null ? null : trip.ticks,
        remainingCost: trip === null ? null : trip.cost,
        progressPermille: done,
        waitingFor: update.crierId === null ? waitingReasonOf(engine, update.boardId) : null,
      };
    });
}

/**
 * Lists the Town Crier fleet, ascending by id (query `town-criers`).
 *
 * @param engine - The engine.
 * @returns One view per crier.
 */
export function buildCrierViews(engine: GameEngine): TownCrierView[] {
  return listCriers(engine).flatMap((crier) => {
    const data = getComponent(crier, townCrierComponent);
    if (data === undefined) {
      return [];
    }
    const position = getComponent(crier, positionComponent);
    return [
      {
        crierId: crier.id,
        status: data.status,
        mapId: position?.mapId ?? null,
        cellIndex: position?.cellIndex ?? null,
        boardQueue: [...data.boardQueue],
        carrying: [...data.carrying],
      },
    ];
  });
}
