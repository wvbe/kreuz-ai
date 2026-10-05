import { z } from "zod";
import { CounterName } from "../engine/IdCounters";
import { getComponent } from "../ecs/Entity";
import type { Entity, EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import type { JsonValue } from "../engine/EventBus";
import { listBoards } from "../jobs/jobBoards";
import { pauseBoard, resumeBoard } from "../jobs/boardPause";
import { getJobService } from "../jobs/jobServiceRegistry";
import { tierOrder } from "../jobs/JobService";
import { PauseSource } from "../jobs/jobTypes";
import type { GameMap } from "../map/GameMap";
import { positionComponent } from "../map/positionComponent";
import { SaveSectionLocation } from "../save/SaveSectionRegistry";
import type { SaveSection } from "../save/SaveSectionRegistry";
import { combineMilli } from "../inventory/inventoryMath";
import type { MaterialFilter, ZoneRouteInfo } from "../storage/storageTypes";
import { decayRateModifierId } from "../storage/storageTypes";
import { ZoneError, ZoneErrorKind } from "./ZoneError";
import { zoneComponent } from "./zoneComponent";
import { enclosingRingCells, evaluateZone, isEnclosingCell } from "./zoneEvaluation";
import { connectedComponents } from "./zoneGeometry";
import {
  dwellingZoneTypeId,
  stockpileZoneTypeId,
  zoneCreatedEvent,
  zoneDeletedEvent,
  zoneMergedEvent,
  zoneMergeOfferedEvent,
  zonePrototypeId,
  zoneRequirementsLostEvent,
  zoneRequirementsMetEvent,
  zoneRoomChangedEvent,
  zoneSplitEvent,
  ZoneStatus,
} from "./zoneTypes";
import type { MergeOffer, ZoneData, ZoneLifecycle } from "./zoneTypes";

/**
 * A merge offer as saved: the offer plus the tile counts of both zones when it was made, so an
 * offer lapses when either zone changes (DECISIONS D-11).
 */
export type SavedMergeOffer = MergeOffer & {
  tilesA: number;
  tilesB: number;
};

const zonesSectionSchema = z
  .object({
    mergeOffers: z.array(
      z
        .object({
          offerId: z.number().int().min(1),
          zoneAId: z.number().int().min(1),
          zoneBId: z.number().int().min(1),
          tilesA: z.number().int().min(0),
          tilesB: z.number().int().min(0),
        })
        .strict(),
    ),
    pausedBoards: z.array(z.number().int().min(1)),
  })
  .strict();

/**
 * Result of changing the tiles of a zone.
 */
export type ZoneChange = {
  /**
   * The zone that was changed (it keeps its id; gone when it lost all tiles).
   */
  zoneId: EntityId;
  /**
   * Zones that were split off (or created for disconnected new cells), ascending.
   */
  newZoneIds: EntityId[];
};

/**
 * Per-engine zone state: the cell index (derived, rebuilt on load), the merge offers (saved in
 * `systems.zones`) and the operations behind the zone commands. Evaluation of requirements runs
 * in slot 9 of the tick pipeline (`evaluateAll`); commands only change tiles and mark nothing,
 * because slot 9 re-derives every zone each tick (DECISIONS D-11 timing rule).
 */
export class ZoneService {
  private offers: SavedMergeOffer[] = [];
  private pausedBoards: EntityId[] = [];
  private readonly index = new Map<number, Map<number, EntityId>>();
  private readonly knownEnclosure = new Map<EntityId, Set<number>>();

  /**
   * Creates the service for one engine.
   *
   * @param engine - The engine whose entities, maps and content are used.
   */
  constructor(private readonly engine: GameEngine) {}

  /**
   * All zone entities that are not being deleted, ascending by id.
   *
   * @returns Live entities that carry `Zone`.
   */
  zones(): Entity[] {
    return this.engine.store
      .entities()
      .filter((entity) => getComponent(entity, zoneComponent) !== undefined);
  }

  /**
   * The zone with an id.
   *
   * @param zoneId - Entity id.
   * @returns The entity and its data, or null when it is no live zone.
   */
  getZone(zoneId: EntityId): { entity: Entity; data: ZoneData } | null {
    const entity = this.engine.store.get(zoneId);
    const data = entity === undefined ? undefined : getComponent(entity, zoneComponent);
    return entity === undefined || data === undefined || this.engine.store.isPendingDelete(zoneId)
      ? null
      : { entity, data };
  }

  /**
   * Like {@link ZoneService.getZone} but throws `ZoneError` `UnknownZone`.
   *
   * @param zoneId - Entity id.
   * @returns The entity and its data.
   */
  requireZone(zoneId: EntityId): { entity: Entity; data: ZoneData } {
    const found = this.getZone(zoneId);
    if (found === null) {
      throw new ZoneError(ZoneErrorKind.UnknownZone, `entity ${zoneId} is not a zone`);
    }
    return found;
  }

  /**
   * The zone that covers a cell (spec 015 FR-016); every cell is in at most one zone.
   *
   * @param mapId - Map id.
   * @param cellIndex - Cell index.
   * @returns The zone id, or null.
   */
  zoneIdAt(mapId: number, cellIndex: number): EntityId | null {
    return this.index.get(mapId)?.get(cellIndex) ?? null;
  }

  /**
   * Rebuilds the cell index from the zone components (after a load).
   */
  rebuildIndex(): void {
    this.index.clear();
    for (const entity of this.zones()) {
      const data = getComponent(entity, zoneComponent);
      if (data !== undefined) {
        this.setIndex(data.mapId, data.tiles, entity.id);
      }
    }
  }

  /**
   * The merge offers in force, ascending by offer id.
   *
   * @returns Copies of the offers.
   */
  mergeOffers(): MergeOffer[] {
    return this.offers.map(({ offerId, zoneAId, zoneBId }) => ({ offerId, zoneAId, zoneBId }));
  }

  /**
   * Creates zones from painted cells (command `DesignateZone`, spec 015 FR-003/004): disconnected
   * cells give one zone per connected component, ids ascending by the lowest cell. A cell that
   * is in another zone rejects the command unless `reassign` moves it.
   *
   * @param zoneTypeId - Zone type of the content pack.
   * @param mapId - The map.
   * @param cells - Cells to paint.
   * @param reassign - Move cells out of the zones that hold them instead of rejecting.
   * @returns The new zone ids, ascending.
   */
  designate(
    zoneTypeId: string,
    mapId: number,
    cells: readonly number[],
    reassign: boolean,
  ): EntityId[] {
    this.requireUnlocked(zoneTypeId);
    const map = this.requireMap(mapId);
    const painted = this.requireCells(map, cells);
    this.claimCells(mapId, painted, null, reassign);
    return connectedComponents(map, painted).map((component) =>
      this.createZone(zoneTypeId, mapId, component, null),
    );
  }

  /**
   * Adds cells to a zone (command `AddZoneTiles`). Cells already in the zone are ignored; new
   * cells that do not touch the zone become zones of their own (components, ids ascending).
   *
   * @param zoneId - The zone.
   * @param cells - Cells to add.
   * @param reassign - Move cells out of other zones instead of rejecting.
   * @returns The zone id and the zones created for disconnected cells.
   */
  addTiles(zoneId: EntityId, cells: readonly number[], reassign: boolean): ZoneChange {
    const { data } = this.requireZone(zoneId);
    const map = this.requireMap(data.mapId);
    const fresh = this.requireCells(map, cells).filter((cell) => !data.tiles.includes(cell));
    this.claimCells(data.mapId, fresh, zoneId, reassign);
    const united = connectedComponents(map, [...data.tiles, ...fresh]);
    const main = united.find((component) => component.some((cell) => data.tiles.includes(cell)));
    const own = main ?? [];
    this.setIndex(data.mapId, own, zoneId);
    data.tiles = own;
    const newZoneIds = united
      .filter((component) => component !== main)
      .map((component) => this.createZone(data.zoneTypeId, data.mapId, component, data.filter));
    return { zoneId, newZoneIds };
  }

  /**
   * Removes cells from a zone (command `RemoveZoneTiles`, spec 015 FR-015, DECISIONS D-11). A
   * zone without tiles is deleted. When the rest is disconnected the largest part keeps the id
   * (ties: the part with the lowest cell) and the others become new zones, ascending, with
   * `zone.split`.
   *
   * @param zoneId - The zone.
   * @param cells - Cells to remove; cells outside the zone are ignored.
   * @returns The zone id and the zones split off.
   */
  removeTiles(zoneId: EntityId, cells: readonly number[]): ZoneChange {
    const { data } = this.requireZone(zoneId);
    const map = this.requireMap(data.mapId);
    const drop = new Set(cells);
    const removed = data.tiles.filter((tile) => drop.has(tile));
    const rest = data.tiles.filter((tile) => !drop.has(tile));
    this.unsetIndex(data.mapId, removed);
    if (rest.length === 0) {
      this.deleteZone(zoneId);
      return { zoneId, newZoneIds: [] };
    }
    const parts = connectedComponents(map, rest);
    let keep = parts[0] ?? rest;
    for (const part of parts) {
      if (part.length > keep.length) {
        keep = part;
      }
    }
    data.tiles = keep;
    const newZoneIds = parts
      .filter((part) => part !== keep)
      .map((part) => this.createZone(data.zoneTypeId, data.mapId, part, data.filter));
    if (newZoneIds.length > 0) {
      this.engine.bus.emit(zoneSplitEvent, { zoneId, newZoneIds });
    }
    return { zoneId, newZoneIds };
  }

  /**
   * Deletes a zone: its tiles are free at once, its offers lapse, its effects stop and
   * `zone.deleted` is queued (spec 015 FR-014).
   *
   * @param zoneId - The zone.
   */
  deleteZone(zoneId: EntityId): void {
    const { entity, data } = this.requireZone(zoneId);
    this.unsetIndex(data.mapId, data.tiles);
    this.knownEnclosure.delete(zoneId);
    this.offers = this.offers.filter(
      (offer) => offer.zoneAId !== zoneId && offer.zoneBId !== zoneId,
    );
    this.engine.store.requestDelete(entity.id);
    const payload: ZoneLifecycle = { zoneId, zoneTypeId: data.zoneTypeId, mapId: data.mapId };
    this.engine.bus.emit(zoneDeletedEvent, payload);
  }

  /**
   * Sets the zone-level material filter (command `SetZoneMaterialFilter`).
   *
   * @param zoneId - The zone.
   * @param filter - The normalized filter, or null for "accept all".
   */
  setFilter(zoneId: EntityId, filter: MaterialFilter | null): void {
    this.requireZone(zoneId).data.filter = filter;
  }

  /**
   * Answers a merge offer (command `ConfirmZoneMerge`, DECISIONS D-11). On accept the lower zone
   * id survives and takes the tiles of the other plus the free cells that touch both (the cells
   * where the wall stood), so the zone stays contiguous; `zone.merged` is queued.
   *
   * @param offerId - The offer.
   * @param accept - True to merge, false to decline.
   * @returns The surviving zone id when merged, else null.
   */
  confirmMerge(offerId: number, accept: boolean): EntityId | null {
    const offer = this.offers.find((candidate) => candidate.offerId === offerId);
    if (offer === undefined) {
      throw new ZoneError(ZoneErrorKind.UnknownOffer, `merge offer ${offerId} does not exist`);
    }
    this.offers = this.offers.filter((candidate) => candidate !== offer);
    if (!accept) {
      return null;
    }
    const survivor = this.requireZone(offer.zoneAId);
    const absorbed = this.requireZone(offer.zoneBId);
    const map = this.requireMap(survivor.data.mapId);
    const bridge = this.freeCellsBetween(map, survivor.data.tiles, absorbed.data.tiles);
    const merged = [...survivor.data.tiles, ...absorbed.data.tiles, ...bridge].sort(
      (left, right) => left - right,
    );
    if (connectedComponents(map, merged).length !== 1) {
      throw new ZoneError(
        ZoneErrorKind.UnknownOffer,
        `merge offer ${offerId} lapsed: the zones are no longer joined`,
      );
    }
    this.unsetIndex(absorbed.data.mapId, absorbed.data.tiles);
    this.knownEnclosure.delete(absorbed.entity.id);
    this.offers = this.offers.filter(
      (candidate) =>
        candidate.zoneAId !== absorbed.entity.id && candidate.zoneBId !== absorbed.entity.id,
    );
    this.engine.store.requestDelete(absorbed.entity.id);
    survivor.data.tiles = merged;
    this.setIndex(survivor.data.mapId, merged, survivor.entity.id);
    this.engine.bus.emit(zoneMergedEvent, {
      survivorId: survivor.entity.id,
      absorbedId: absorbed.entity.id,
    });
    return survivor.entity.id;
  }

  /**
   * Re-derives every zone from the world (the slot-9 system, DECISIONS D-11): room flag, status
   * and gaps, `zone.room.changed`, `zone.requirements.met` / `.lost` on transitions, merge
   * offers where a wall between same-type zones disappeared, lapsing offers, and the system
   * pause of job boards in inactive zones. A silent run (`emit` false) is used on load: the
   * derived state is rebuilt without events (FR-013).
   *
   * @param tick - The tick being processed.
   * @param emit - False for the silent rebuild after a load.
   */
  evaluateAll(tick: number, emit: boolean): void {
    for (const entity of this.zones()) {
      const data = getComponent(entity, zoneComponent);
      if (data === undefined) {
        continue;
      }
      const result = evaluateZone(this.engine, data);
      const wasActive = data.active;
      const wasRoom = data.isRoom;
      data.isRoom = result.isRoom;
      data.status = result.status;
      data.gaps = result.gaps;
      data.active = result.status === ZoneStatus.Active;
      if (data.active !== wasActive) {
        data.activeSinceTick = emit ? tick : data.activeSinceTick;
      }
      if (!emit) {
        this.knownEnclosure.set(
          entity.id,
          new Set(
            enclosingRingCells(this.engine, this.engine.maps.require(data.mapId), data.tiles),
          ),
        );
        continue;
      }
      if (data.isRoom !== wasRoom) {
        this.engine.bus.emit(zoneRoomChangedEvent, { zoneId: entity.id, isRoom: data.isRoom });
      }
      if (data.active && !wasActive) {
        this.engine.bus.emit(zoneRequirementsMetEvent, {
          zoneId: entity.id,
          zoneTypeId: data.zoneTypeId,
        });
      } else if (!data.active && wasActive) {
        this.engine.bus.emit(zoneRequirementsLostEvent, {
          zoneId: entity.id,
          zoneTypeId: data.zoneTypeId,
          gaps: data.gaps.map((gap) => ({ ...gap })),
        });
      }
      this.detectOpenedWalls(entity, data);
    }
    this.lapseOffers();
    this.syncBoards();
  }

  /**
   * What routing needs to know about the zone that covers a cell (see `ZoneRouteInfo`).
   *
   * @param mapId - Map id.
   * @param cellIndex - Cell index.
   * @returns The info, or null when no zone covers the cell.
   */
  routeInfoAt(mapId: number, cellIndex: number): ZoneRouteInfo | null {
    const zoneId = this.zoneIdAt(mapId, cellIndex);
    const zone = zoneId === null ? null : this.getZone(zoneId);
    if (zone === null) {
      return null;
    }
    const type = this.engine.content.zones.find(zone.data.zoneTypeId);
    return {
      zoneId: zone.entity.id,
      zoneTypeId: zone.data.zoneTypeId,
      stockpile: zone.data.zoneTypeId === stockpileZoneTypeId,
      excluded: zone.data.zoneTypeId === dwellingZoneTypeId,
      filter: zone.data.filter,
      skillId: type?.skillAffinityId ?? null,
    };
  }

  /**
   * The decay multiplier the zone around a storage entity gives its contents (the Pantry of spec
   * 018 FR-007): the product of the `inventory.decay.rate` effects of the active zone, from the
   * tick after it became active.
   *
   * @param entity - The storage entity.
   * @returns Permille, or null when no active zone with such an effect covers it.
   */
  decayModifierAt(entity: Entity): number | null {
    const place = getComponent(entity, positionComponent);
    const zoneId = place === undefined ? null : this.zoneIdAt(place.mapId, place.cellIndex);
    const zone = zoneId === null ? null : this.getZone(zoneId);
    if (
      zone === null ||
      !zone.data.active ||
      zone.data.activeSinceTick === null ||
      this.engine.time.tickCount <= zone.data.activeSinceTick
    ) {
      return null;
    }
    let value: number | null = null;
    for (const effect of this.engine.content.zones.find(zone.data.zoneTypeId)?.effects ?? []) {
      if (effect.modifierId === decayRateModifierId) {
        value = combineMilli(value ?? 1000, effect.value);
      }
    }
    return value;
  }

  /**
   * The save section `systems.zones`: the merge offers and the boards the zones paused.
   *
   * @returns The section for `registerSystem({ saveSection })`.
   */
  createSection(): SaveSection {
    return {
      key: "zones",
      location: SaveSectionLocation.Systems,
      schema: zonesSectionSchema,
      serialize: () => ({
        mergeOffers: this.offers.map((offer) => ({ ...offer })),
        pausedBoards: [...this.pausedBoards],
      }),
      restore: (saved: JsonValue) => {
        const parsed = zonesSectionSchema.parse(saved);
        this.offers = parsed.mergeOffers;
        this.pausedBoards = parsed.pausedBoards;
      },
      defaultForOlderSaves: () => ({ mergeOffers: [], pausedBoards: [] }),
    };
  }

  private requireMap(mapId: number): GameMap {
    const map = this.engine.maps.get(mapId);
    if (map === undefined) {
      throw new ZoneError(ZoneErrorKind.UnknownMap, `map ${mapId} does not exist`);
    }
    return map;
  }

  private requireCells(map: GameMap, cells: readonly number[]): number[] {
    for (const cell of cells) {
      if (!map.inBounds(cell)) {
        throw new ZoneError(
          ZoneErrorKind.OutOfBounds,
          `cell ${cell} is not on map ${map.id} (${map.cellCount} cells)`,
        );
      }
    }
    return [...new Set(cells)].sort((left, right) => left - right);
  }

  private requireUnlocked(zoneTypeId: string): void {
    const type = this.engine.content.zones.find(zoneTypeId);
    if (type === undefined) {
      throw new ZoneError(
        ZoneErrorKind.UnknownZoneType,
        `zone type "${zoneTypeId}" is not in the content pack`,
      );
    }
    const needed = type.unlockTier === undefined ? 0 : tierOrder.indexOf(type.unlockTier);
    if (needed > tierOrder.indexOf(getJobService(this.engine).currentTier())) {
      throw new ZoneError(
        ZoneErrorKind.ContentLocked,
        `zone type "${zoneTypeId}" needs the tier ${type.unlockTier ?? ""}`,
      );
    }
  }

  /**
   * Takes cells that other zones hold: rejects, or (reassign) removes them from those zones.
   * Cells of `own` stay put.
   *
   * @param mapId - The map.
   * @param cells - The cells to take.
   * @param own - The zone that takes them, or null for a new zone.
   * @param reassign - Move the cells instead of rejecting.
   */
  private claimCells(
    mapId: number,
    cells: readonly number[],
    own: EntityId | null,
    reassign: boolean,
  ): void {
    const taken = new Map<EntityId, number[]>();
    for (const cell of cells) {
      const holder = this.zoneIdAt(mapId, cell);
      if (holder === null || holder === own) {
        continue;
      }
      if (!reassign) {
        throw new ZoneError(
          ZoneErrorKind.TileAlreadyZoned,
          `cell ${cell} is already in zone ${holder}`,
        );
      }
      taken.set(holder, [...(taken.get(holder) ?? []), cell]);
    }
    for (const [holder, held] of [...taken].sort((left, right) => left[0] - right[0])) {
      if (own !== null && holder === own) {
        continue;
      }
      this.removeTiles(holder, held);
    }
  }

  private createZone(
    zoneTypeId: string,
    mapId: number,
    tiles: readonly number[],
    filter: MaterialFilter | null,
  ): EntityId {
    const entity = this.engine.store.spawn(zonePrototypeId, {
      Zone: {
        zoneTypeId,
        mapId,
        tiles: [...tiles],
        filter,
        createdTick: this.engine.time.tickCount,
      },
    });
    this.setIndex(mapId, tiles, entity.id);
    const payload: ZoneLifecycle = { zoneId: entity.id, zoneTypeId, mapId };
    this.engine.bus.emit(zoneCreatedEvent, payload);
    return entity.id;
  }

  private setIndex(mapId: number, cells: readonly number[], zoneId: EntityId): void {
    let cellMap = this.index.get(mapId);
    if (cellMap === undefined) {
      cellMap = new Map();
      this.index.set(mapId, cellMap);
    }
    for (const cell of cells) {
      cellMap.set(cell, zoneId);
    }
  }

  private unsetIndex(mapId: number, cells: readonly number[]): void {
    const cellMap = this.index.get(mapId);
    for (const cell of cells) {
      cellMap?.delete(cell);
    }
  }

  private freeCellsBetween(
    map: GameMap,
    first: readonly number[],
    second: readonly number[],
  ): number[] {
    const left = new Set(first);
    const right = new Set(second);
    const bridge: number[] = [];
    for (const cell of first) {
      for (const next of map.neighbors(cell)) {
        if (
          !left.has(next) &&
          !right.has(next) &&
          this.zoneIdAt(map.id, next) === null &&
          !isEnclosingCell(this.engine, map, next) &&
          map.neighbors(next).some((other) => right.has(other)) &&
          !bridge.includes(next)
        ) {
          bridge.push(next);
        }
      }
    }
    return bridge;
  }

  /**
   * A cell that enclosed a zone last time and does not now was a wall that disappeared: when it
   * touches another zone of the same type, the two are offered for merging (DECISIONS D-11).
   *
   * @param entity - The zone entity.
   * @param data - Its component data.
   */
  private detectOpenedWalls(entity: Entity, data: ZoneData): void {
    const map = this.engine.maps.require(data.mapId);
    const before = this.knownEnclosure.get(entity.id) ?? new Set<number>();
    const now = new Set(enclosingRingCells(this.engine, map, data.tiles));
    this.knownEnclosure.set(entity.id, now);
    for (const cell of [...before].sort((left, right) => left - right)) {
      if (now.has(cell) || this.zoneIdAt(map.id, cell) !== null) {
        continue;
      }
      for (const next of map.neighbors(cell)) {
        const otherId = this.zoneIdAt(map.id, next);
        const other = otherId === null || otherId === entity.id ? null : this.getZone(otherId);
        if (other === null || other.data.zoneTypeId !== data.zoneTypeId) {
          continue;
        }
        const [low, high] =
          entity.id < other.entity.id ? [entity.id, other.entity.id] : [other.entity.id, entity.id];
        if (this.offers.some((offer) => offer.zoneAId === low && offer.zoneBId === high)) {
          continue;
        }
        const lowData = low === entity.id ? data : other.data;
        const highData = low === entity.id ? other.data : data;
        const offer: SavedMergeOffer = {
          offerId: this.engine.counters.allocate(CounterName.OfferId),
          zoneAId: low,
          zoneBId: high,
          tilesA: lowData.tiles.length,
          tilesB: highData.tiles.length,
        };
        this.offers.push(offer);
        this.engine.bus.emit(zoneMergeOfferedEvent, {
          offerId: offer.offerId,
          zoneAId: low,
          zoneBId: high,
        });
      }
    }
  }

  private lapseOffers(): void {
    this.offers = this.offers.filter((offer) => {
      const first = this.getZone(offer.zoneAId);
      const second = this.getZone(offer.zoneBId);
      return (
        first !== null &&
        second !== null &&
        first.data.tiles.length === offer.tilesA &&
        second.data.tiles.length === offer.tilesB
      );
    });
  }

  /**
   * A job board on a tile of a zone that is not active is paused by the system, and resumed when
   * the zone is active again or gone (spec 017 FR-018, DECISIONS D-46). Only the pauses the zones
   * set are lifted (they are remembered in the save), so another system's pause and the player's
   * own pause are untouched.
   */
  private syncBoards(): void {
    const boards = listBoards(this.engine);
    const held = new Set(this.pausedBoards);
    for (const board of boards) {
      const place = getComponent(board, positionComponent);
      const zoneId = place === undefined ? null : this.zoneIdAt(place.mapId, place.cellIndex);
      const zone = zoneId === null ? null : this.getZone(zoneId);
      if (zone !== null && !zone.data.active) {
        if (pauseBoard(this.engine, board.id, PauseSource.System)) {
          held.add(board.id);
        }
      } else if (held.has(board.id)) {
        resumeBoard(this.engine, board.id, PauseSource.System);
        held.delete(board.id);
      }
    }
    const live = new Set(boards.map((board) => board.id));
    this.pausedBoards = [...held].filter((id) => live.has(id)).sort((left, right) => left - right);
  }
}
