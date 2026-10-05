# src/game/inventory

Inventory component, material registry and the synchronous, atomic store/retrieve/transfer/equip/money functions (spec 005, DECISIONS D-07, D-35).

- `inventoryTypes.ts` - `InventoryData`, `InventorySlot`, `EquipmentSlot`, `PermissionRule` (+ `PermissionType`, `InventoryOperation`, `PermissionTargetKind` enums), `InventoryContext`, result types.
- `inventoryComponent.ts` - the `Inventory` component (strict Zod schema `inventoryDataSchema`). Slots are dense, occupied only, in creation order; `slotCount` is the capacity; slots do not store `stackLimit`.
- `MaterialRegistry.ts` - per-engine material definitions `{ id, name, categories, stackLimit, weightMilli, valueMilli?, perishabilityTicks? }` and the currency id (default `silver_penny`). The content loader (task 1.7) fills it with `materialDefinitionSchema`.
- `inventoryOperations.ts` - `store`, `storeUpTo`, `retrieve`, `transfer`, `equip`, `unequip`. Every call takes `ctx: { materials, actor, bus?, resolver? }` first; `actor: null` is the system actor and bypasses permission rules.
- `inventoryQueries.ts` - `canStore`, `canRetrieve`, `availableSlots`, `availableWeight`, `currentWeight`, `getTotal`, `getAllItems`, `requireInventory`. Queries see new state immediately.
- `inventoryMoney.ts` - `getBalance`, `credit`, `debit` on the currency material (whole coins).
- `inventoryDecay.ts` - `decayInventory` / `decayInventories` for pipeline slot 3 (perishable timers, `inventory.item.expired`).
- `inventoryPermissions.ts` - rule evaluation (`isOperationAllowed`, `assertOperationAllowed`).
- `stackPlanning.ts` - pure stack arithmetic on slot lists (fit, add, take) shared by the operations.
- `InventoryError.ts` - `InventoryError` with an `InventoryErrorKind` plus the spec error classes (`InventoryFullError`, `DestinationFullError`, `InsufficientItemsError`, `InsufficientFundsError`, `WeightLimitExceededError`, `UnknownMaterialError`, `AccessDeniedError`, `EquipmentSlotIncompatibleError`, `InvalidQuantityError`, `InvalidTransferError`).
- `inventoryMath.ts` - `floorDivide`, `combineMilli`, `assertPositiveQuantity`.
- `testInventories.ts` - shared test fixtures (materials, entity, context with event capture).

## Rules

- Quantities are plain positive integers; weights are milli-units; perishable timers are milli-ticks. No fractions anywhere.
- Mutations are all-or-nothing: every check runs first, new slot lists are built on copies and assigned at the end, events are emitted only after success. A failed call leaves all inventories unchanged.
- Store fills partial stacks in slot order, then opens new slots. Retrieve drains the soonest-to-expire stacks first, then the smallest. Perishable merges use the weighted floor of remaining time. Transfers keep each portion's freshness.
- Capacity is `min(slot fit, weight fit)`; `canStore` with wood 8/50, limit 50 and 2 free slots gives `fits: true, maxFittable: 142` for 60 wood. Slot shortage raises `InventoryFullError` (`DestinationFullError` for transfers), weight shortage `WeightLimitExceededError`.
- Permissions: first matching rule wins, no match allows; `Transfer` rules match `Store` and `Retrieve`; `Equip` covers equip and unequip. Faction and role targets need an `ActorResolver`.
- Events (queued on the bus at call time): `inventory.item.stored`, `.retrieved`, `.transferred` (transfers emit only this), `.equipped`, `.unequipped`, `.expired`, `.stack.merged` (perishable merge).
- Reservations (D-09) are not here: the `ReservationService` lives in `../storage` (task 3.2) and keeps its state in `systems.reservations`; it only needs `queryable` and the quantity queries from this folder. `queryable: false` hides an inventory from storage queries (construction sites set it).
