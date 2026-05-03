# Feature Specification: Trade System & Currency

**Feature Branch**: `020-trade-currency`
**Created**: 2026-05-03
**Status**: Draft
**Input**: User description: "the trade system and currency. I want entities to be able to trade the items they need for their own needs with other entities. There is an in-game currency for this, which entities can earn through trade or work. The currency is an actual item, so it is stored in stacks (of max 1000). Every trade starts with the potential buyer making an offer for the goods, the offer could be currency or other items. The trader is at liberty to accept any offer, but will generally try to make a small profit. The user also has an inventory that can hold currency, this inventory is held in one or more containers in the same room (the throne room) as where town criers are dispatched from."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Currency as an Inventory Item (Priority: P1)

Currency is a first-class material in the game world. It is registered in the material registry as a stackable item with a maximum stack size of 1000. Any entity or container with an inventory can hold currency using the same inventory mechanics as any other material (feature 005). There is no separate wallet or currency component: currency is simply an item stack identified by its material ID. Entities earn currency by receiving it into their inventory — through wages for completed work or as accepted trade payment.

**Why this priority**: Currency must exist as an item before any trade or payment can occur. Every economic interaction depends on this. Foundational and blocking.

**Independent Test**: Can be fully tested headlessly by: registering the currency material with stack limit 1000, storing 500 units in an entity's inventory, adding 700 more, verifying overflow into a second stack, and confirming the same `InventoryFullError` semantics as any other item (feature 005).

**Acceptance Scenarios**:

1. **Given** the currency material registered with `stackLimit: 1000`, **When** 500 currency units are stored in an entity's inventory, **Then** one slot holds a stack of 500 and the slot count decrements as normal.
2. **Given** an inventory slot holding 800 currency, **When** 400 more currency units are added, **Then** 200 fill the existing stack (now 1000) and 200 overflow into a new slot.
3. **Given** an entity's inventory is full with only currency stacks all at 1000, **When** any further currency is received, **Then** the receive is rejected with `InventoryFullError`; the sender retains the currency.
4. **Given** any entity with currency in their inventory, **When** queried for currency availability, **Then** the result is identical to querying for any other material — same interface, same totals.
5. **Given** an entity with currency is serialized and deserialized, **Then** currency stacks are preserved with exact quantities (consistent with feature 005 serialization).

---

### User Story 2 - Player Treasury in the Throne Room (Priority: P1)

The player's currency is stored in one or more storage containers (chests, coffers, etc.) placed within the Throne Room zone (feature 015). This is the colony's communal treasury. Wages paid to working entities, taxes, and sale proceeds flow out of or into these containers. The treasury has no special API — it is simply the collective inventory of all storage furniture in the Throne Room zone. The total treasury balance is the sum of all currency items across those containers.

**Why this priority**: The player needs to be able to observe and manage their colony's finances from a single canonical location. The Throne Room co-location with Town Crier dispatch (feature 017) grounds the treasury in the game world.

**Independent Test**: Can be fully tested headlessly by: creating a Throne Room zone, placing two chest entities in it, storing 500 currency in each, querying the total treasury balance, and verifying it equals 1000.

**Acceptance Scenarios**:

1. **Given** a Throne Room zone with two chests (500 currency each), **When** the treasury balance is queried, **Then** the total is 1000 currency (sum across all Throne Room storage furniture).
2. **Given** the Throne Room zone has a chest at full currency capacity, **When** additional currency arrives (e.g., from wages received), **Then** it flows into any other Throne Room container with space; if none has space, the payment is deferred until space is available.
3. **Given** a storage container is removed from the Throne Room, **When** the treasury is queried, **Then** only the remaining containers' currency totals are summed; the removed container's contents move with the furniture.
4. **Given** the Throne Room zone is the canonical treasury, **When** a wage payment is due to the colony (from completed work), **Then** currency is drawn from Throne Room containers in the order retrieved by the storage query system (feature 018).
5. **Given** the player adds a new coffer to the Throne Room, **When** it receives currency, **Then** its contents are immediately included in the treasury total without any registration step.

---

### User Story 3 - Buyer-Initiated Offer (Priority: P1)

When an entity needs a material it does not have (e.g., a hungry citizen needing food), it can initiate a trade by making an offer to a holder of that material. The buyer identifies a potential seller (an entity whose inventory contains the desired material), then constructs and sends a **TradeOffer**: the goods requested, the quantity, and what the buyer proposes to give in return (currency or barter items). The offer is a formal event emitted on the event bus. The seller receives the offer and evaluates it. Any entity with a `sellsItems` flag set may act as a seller. This flag can be set on an entity prototype (e.g., a permanent merchant shop) or toggled dynamically at runtime — for example, a citizen with surplus food or a need for currency may raise their flag and become approachable as a seller until their surplus is gone or their need is met.

**Why this priority**: The offer-initiation model drives all economic activity. Entities independently seeking to fulfil their needs creates emergent market behaviour without a central auction system.

**Independent Test**: Can be fully tested headlessly by: creating a Buyer entity (needs Food) and a Seller entity (holds 10 Food, `sellsItems: true`), having the Buyer emit a TradeOffer for 2 Food at 10 currency, and verifying the Seller receives the offer event.

**Acceptance Scenarios**:

1. **Given** a Citizen entity with a Food need and 20 currency, **When** the Citizen identifies a nearby entity with `sellsItems: true` holding Food, **Then** the Citizen emits a `trade.offer.proposed` event containing: buyer ID, seller ID, requested item (Food × 2), and offered payment (currency × 10).
2. **Given** a Buyer entity without enough currency to meet the minimum expected price, **When** the Buyer still wants the goods, **Then** the Buyer may offer barter items instead (or a mix of currency and barter items) in the same TradeOffer structure.
3. **Given** a Buyer has sent a TradeOffer, **When** no response is received within a configurable timeout, **Then** the offer expires and the Buyer may reattempt with a revised offer or seek a different seller.
4. **Given** a Buyer is mid-negotiation (offer sent, awaiting reply), **When** the Buyer's need becomes critical, **Then** the Buyer may withdraw the pending offer and escalate (higher offer or different seller).
5. **Given** a Buyer cannot locate any entity with `sellsItems: true` holding the desired item, **When** the search completes, **Then** no TradeOffer is created; the Buyer falls back to need-satisfaction alternatives (foraging, production, waiting).
6. **Given** a Citizen entity has surplus Bread and needs currency, **When** the Citizen sets `sellsItems: true` on themselves, **Then** other entities can now approach them with TradeOffers for their Bread.
7. **Given** a Citizen sells all their surplus and no longer needs currency, **When** the Citizen clears their `sellsItems` flag, **Then** they can no longer be approached as a seller.

---

### User Story 4 - Seller Evaluation and Profit Logic (Priority: P1)

When a seller receives a TradeOffer, it evaluates whether to accept or counter-offer based on a simple profit check: the offer's total value must equal or exceed the seller's cost basis plus a minimum profit margin. Each seller has a reference price for items it holds, derived from a global Item Value Registry (a data-driven mapping of material ID to base price in currency units) multiplied by a per-entity `priceMultiplier` (default 1.0; e.g., 1.2 = 20% more expensive than base). The effective minimum acceptable price for a sale is `basePrice × priceMultiplier × quantity × (1 + minimumMarginRate)`. If the offer meets the threshold, the seller accepts. If it does not, the seller may counter with the minimum acceptable amount. A seller never sells below this threshold by default.

**Why this priority**: Without a consistent evaluation model, trade is either always accepted (trivially exploitable) or always negotiated in unbounded loops. The profit-margin model provides predictable, tuneable seller behaviour.

**Independent Test**: Can be fully tested headlessly by: creating a Seller with Food at global base price 5 currency/unit, `priceMultiplier: 1.0`, minimum margin 10%, and receiving an offer of 9 currency for 2 Food (value = 10 < 5 × 1.0 × 2 × 1.1 = 11). Verify the seller counter-offers at 11 currency.

**Acceptance Scenarios**:

1. **Given** a Seller with Food at global base price 5/unit, `priceMultiplier: 1.0`, and 10% minimum margin (threshold = 11 currency for 2 Food), **When** a Buyer offers 12 currency, **Then** the Seller accepts and emits `trade.offer.accepted`.
2. **Given** the same Seller, **When** a Buyer offers 9 currency for 2 Food (< 11), **Then** the Seller emits `trade.offer.countered` with a minimum acceptable offer of 11 currency.
3. **Given** a Seller with `priceMultiplier: 1.5` and the same base price and margin, **When** a Buyer offers 11 currency for 2 Food (threshold is now 5 × 1.5 × 2 × 1.1 = 16.5), **Then** the Seller counter-offers at 17 currency (rounded up).
4. **Given** a Seller receives a barter offer (3 Stone for 2 Food), **When** the Seller evaluates the offer, **Then** the Seller looks up Stone's global base price, applies the same `priceMultiplier` and `minimumMarginRate`, and accepts or counters accordingly.
4. **Given** a Seller has already accepted a trade offer and reserved the goods, **When** a second Buyer offers more, **Then** the Seller honours the first accepted offer; the goods are not re-offered until the first trade completes or is cancelled.
5. **Given** a Seller's inventory has only 1 Food remaining but a Buyer requests 2, **When** the Seller evaluates the offer, **Then** the Seller either counter-offers for 1 unit or rejects if the partial quantity does not meet its threshold.

---

### User Story 5 - Trade Execution and Inventory Transfer (Priority: P1)

Once a TradeOffer is accepted, both sides atomically exchange items. The buyer's offered payment is transferred from the buyer's inventory to the seller's inventory; the requested goods are transferred from the seller's inventory to the buyer's inventory. If either transfer fails (insufficient items, inventory full), the trade is cancelled and both inventories are restored to their pre-trade state. Trade execution emits events on both sides.

**Why this priority**: The actual exchange must be reliable and atomic. Partial trades (payment taken, goods not delivered) would break economic balance and be untestable.

**Independent Test**: Can be fully tested headlessly by: executing a trade between two entities, verifying both inventories update correctly, then simulating a failure mid-transfer (seller inventory full) and verifying full rollback.

**Acceptance Scenarios**:

1. **Given** Buyer (20 currency) and Seller (5 Food), both with inventory space, **When** a trade for 2 Food at 10 currency is executed, **Then** Buyer has 10 currency and 2 Food; Seller has 10 currency and 3 Food.
2. **Given** a trade is accepted but the Buyer's inventory is full (cannot receive the goods), **When** execution is attempted, **Then** the trade is cancelled; both inventories remain unchanged; `trade.execution.failed` is emitted with reason `buyer-inventory-full`.
3. **Given** a trade is accepted but the Seller's inventory is full (cannot receive the payment), **When** execution is attempted, **Then** the trade is cancelled; `trade.execution.failed` emitted with reason `seller-inventory-full`.
4. **Given** a successful trade execution, **When** complete, **Then** `trade.completed` is emitted containing buyer ID, seller ID, items exchanged, and the tick at which it completed.
5. **Given** a trade execution is in progress and the game is saved, **When** loaded, **Then** the pending trade either completes or is cancelled cleanly; no items are lost or duplicated.

---

### User Story 6 - Entities Earn Currency Through Work (Priority: P2)

Entities earn currency as wages for completing assigned work (jobs from feature 017). When a job is completed, the JobBoard (or the posting entity) pays the worker from the colony treasury (Throne Room containers). The wage amount is defined on the JobPosting. If the treasury lacks sufficient currency to pay the wage, the payment is deferred until funds are available. Entities accumulate currency in their own inventory and spend it via the trade system to satisfy their needs.

**Why this priority**: Without earning currency through work, entities have no income and trade collapses. Wages close the economic loop: colony pays workers → workers spend on needs → trade happens. P2 because trade can be demonstrated with pre-seeded currency; wages are needed for the full loop.

**Independent Test**: Can be fully tested headlessly by: completing a job with a wage of 15 currency, verifying 15 currency transfers from a Throne Room chest to the worker's inventory, then verifying the treasury balance decreases by 15.

**Acceptance Scenarios**:

1. **Given** a completed job with wage 15 currency and the Throne Room treasury holding 100 currency, **When** the job completes, **Then** the worker's inventory gains 15 currency and the Throne Room total decreases to 85.
2. **Given** the Throne Room treasury holds only 5 currency and a wage of 15 is due, **When** job completes, **Then** the wage payment is queued; the worker is notified payment is pending; when treasury reaches 15+ the payment is made automatically.
3. **Given** an entity accumulates currency over multiple completed jobs, **When** queried, **Then** total currency in their inventory matches the sum of wages received minus any amounts spent in trades.
4. **Given** a job posting with wage 0, **When** the job completes, **Then** no currency transfer occurs; the worker receives no payment (volunteer/conscript work).
5. **Given** a worker entity's inventory has no space for the wage payment (all slots full), **When** the wage is due, **Then** the payment is deferred until the worker's inventory has available capacity.

---

### Edge Cases

- What happens if a Buyer entity is destroyed mid-negotiation (offer pending)? → The pending offer is cancelled; the `trade.offer.cancelled` event is emitted; the Seller's reserved goods (if any) are released.
- What happens if a Seller entity is destroyed after accepting an offer but before execution? → The trade is cancelled; `trade.execution.failed` is emitted; the Buyer's reserved payment is returned.
- What happens if two Buyers simultaneously offer for the same goods and the Seller only has enough for one? → The Seller accepts the first offer received (by tick order); the second offer is rejected with `trade.offer.rejected` reason `insufficient-stock`.
- What happens if a barter item offered by the Buyer has no entry in the item value registry? → The Seller rejects the offer with `trade.offer.rejected` reason `unknown-item-value`; the Buyer may re-offer with currency.
- What happens if the currency material's stack limit of 1000 is reached across all inventory slots? → Any further currency payment is rejected via standard `InventoryFullError`; the payer retains their currency.
- What happens if the Throne Room has no storage containers? → Treasury balance is 0; wages cannot be paid; a system warning event is emitted.
- What happens if an entity tries to trade with itself? → The trade is rejected immediately; no events are emitted for self-trades.
- What happens if a counter-offer is countered again? → Counter-offers can chain up to a configurable maximum number of rounds (default: 3); after the limit, the offer expires.

## Clarifications

### Session 2026-05-03 (Cross-cutting: Diplomacy & Factions)

- Q: Can entities from hostile factions initiate or accept trade with the player's colony? → A: No. Faction standing gates trade access. An entity whose faction has a hostile standing with the player's faction will refuse TradeOffers from player-colony entities (and vice versa). Neutral or friendly standing allows trade. The diplomacy spec will define the standing thresholds. The `trade.offer.rejected` event should include a `faction-hostile` reason code when this occurs.
- Q: Does faction standing affect the `priceMultiplier` in trade evaluations? → A: Yes — friendly factions may offer better effective prices (lower `priceMultiplier` baseline) and hostile-but-trading factions may charge more. The exact modifiers will be defined in the diplomacy spec; this spec's `priceMultiplier` field should be treated as the base before any faction-standing adjustments.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Currency MUST be registered in the material registry as a stackable item with `stackLimit: 1000`. No special currency component is needed; it is stored and transferred using the standard inventory system (feature 005).
- **FR-002**: Any entity or storage container with an Inventory component MAY hold currency. Currency stacks obey all standard inventory rules (slot limits, weight limits if configured, serialization).
- **FR-003**: The player's treasury MUST be the collective inventory of all storage furniture within the active Throne Room zone (feature 015). Treasury balance = sum of all currency items across those containers.
- **FR-004**: System MUST support a `TradeOffer` structure containing: buyer entity ID, seller entity ID, requested items (material ID × quantity), offered payment (currency amount and/or barter items), and an expiry timeout in ticks.
- **FR-005**: Buyers MUST initiate trades by emitting `trade.offer.proposed`. Any entity capable of AI decision-making (feature 013) MAY initiate a trade when it identifies a need and a potential seller entity whose `sellsItems` flag is set.
- **FR-006**: System MUST define an **Item Value Registry**: a data-driven mapping of material ID to base price in currency units. All sellers use this registry as the starting point for price evaluation.
- **FR-007**: Sellers MUST evaluate incoming TradeOffers by converting the offered payment to a currency-equivalent value using the Item Value Registry, then comparing against `basePrice × priceMultiplier × quantity × (1 + minimumMarginRate)`. If the offer meets the threshold, the Seller accepts; otherwise it counter-offers with the minimum acceptable amount.
- **FR-008**: A Seller entity prototype MUST support two price-related fields: `priceMultiplier` (default 1.0, scales the global base price) and `minimumMarginRate` (default 0.1). Both are set in entity prototype data. An entity may update its own `priceMultiplier` at runtime (e.g., a desperate seller lowering prices).
- **FR-008b**: Any entity MAY set a `sellsItems` flag at runtime (not just at prototype definition time). When set, the entity becomes discoverable as a seller. When cleared, it is no longer approached for trades.
- **FR-009**: Trade execution MUST be atomic: both inventory transfers (payment from buyer, goods from seller) either both succeed or both roll back. No partial execution is permitted.
- **FR-010**: System MUST emit the following events on the event bus (feature 010): `trade.offer.proposed`, `trade.offer.accepted`, `trade.offer.countered`, `trade.offer.rejected`, `trade.offer.cancelled`, `trade.offer.expired`, `trade.completed`, `trade.execution.failed`.
- **FR-011**: Counter-offer chains MUST be bounded by a configurable `maxNegotiationRounds` constant (default: 3). After the limit is reached, the offer expires automatically.
- **FR-012**: Wages for completed jobs MUST be paid from Throne Room treasury containers to the worker's inventory. If the treasury lacks funds, the wage payment MUST be queued and retried each tick until sufficient funds are available.
- **FR-013**: If the worker's inventory has no space for a wage payment, the payment MUST be deferred until space is available.
- **FR-014**: All trade state (pending offers, queued wage payments) MUST serialize to GameState (feature 006) and resume identically on load.
- **FR-015**: System MUST emit `treasury.payment.deferred` when a wage or payment cannot be made due to insufficient treasury funds, and `treasury.payment.completed` when the deferred payment is eventually made.

### Key Entities

- **CurrencyItem**: An instance of the currency material in any inventory. No special component; governed entirely by feature 005 inventory rules. Stack limit: 1000.
- **PlayerTreasury**: Not a distinct entity — a virtual aggregate of all currency in storage furniture within the active Throne Room zone. Queried via the storage query system (feature 018).
- **ItemValueRegistry**: A data-driven registry mapping material IDs to base prices in currency units. Read-only at runtime (game balance data). Used by all sellers as the foundation for price evaluation; each seller applies their own `priceMultiplier` on top.
- **TradeOffer**: A data structure (not a persistent entity) representing a buyer's proposal: buyer ID, seller ID, requested items, offered payment (currency + optional barter items), creation tick, expiry tick.
- **PendingWagePayment**: A serializable record of a deferred wage: job ID, worker entity ID, wage amount, tick it became due. Retried each tick until fulfilled.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Currency can be stored, retrieved, and transferred between any two entities using the standard inventory API with no trade-specific code path.
- **SC-002**: Trade execution is fully atomic: in 100% of test cases where execution is attempted, either both inventories update or neither does.
- **SC-003**: A completed economic loop (entity earns wage → spends currency on need → seller receives currency) can be demonstrated end-to-end in a headless test within a single game session.
- **SC-004**: Item Value Registry is purely data-driven: a new item's base trade price can be set without any code change. Per-entity `priceMultiplier` adjustments are also data-driven (set in entity prototype data).
- **SC-005**: Deferred wage payments are eventually made in 100% of test cases once the treasury has sufficient funds; no payment is silently dropped.
- **SC-006**: All trade state (pending offers, deferred wages) is fully preserved through save/load with no currency loss or duplication.
- **SC-007**: Counter-offer chains never exceed `maxNegotiationRounds`; offers beyond the limit expire cleanly with a `trade.offer.expired` event.

## Assumptions

- **Currency is the only "money" type**: There is one currency material. Multi-currency systems (e.g., gold + silver) are out of scope. Barter is supported as an alternative to currency but the Item Value Registry always prices in currency units.
- **Item Value Registry is static at runtime**: Prices are defined in game data files and do not fluctuate with supply/demand. Dynamic pricing is out of scope for this feature.
- **Any entity can become a seller dynamically**: There is no designated merchant entity type. Any entity may set a `sellsItems` flag — either permanently via its prototype (e.g., a market stall) or dynamically at runtime (e.g., a citizen with surplus goods or a need for currency). The AI system (feature 013) governs when and whether an entity decides to raise or clear this flag.
- **Trade is peer-to-peer**: There is no central marketplace or auction house. Buyers find sellers via the storage query system (feature 018) and approach them directly.
- **Throne Room is a single zone**: There is exactly one active Throne Room zone at a time. If multiple Throne Room zones exist, treasury queries sum across all of them (same logic as any zone query).
- **Wage amounts are fixed per job posting**: Wage negotiation is out of scope. The wage on a JobPosting is authoritative; the worker accepts it as part of taking the job.
