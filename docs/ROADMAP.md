# Kreuzvibe: POC → Production Roadmap

## Completed POC Scope ✓

The POC establishes a working foundation:

- **Event-driven architecture** - Pub/sub system with wildcard subscriptions
- **Entity Component System** - Flexible entity/component model
- **Game loop** - Fixed-timestep tick-based progression
- **Deterministic PRNG** - Reproducible gameplay from seed
- **Save/Load system** - Full state persistence and recovery
- **Procedural generation** - Room/map generation with entity spawning
- **Basic inventory system** - Item and money tracking

## Phase 1: Mechanics & Behaviors (Priority High)

### 1.1 Entity Behavior System

**Objective**: Enable entities to make decisions and take actions

**Tasks**:

- [ ] Define action types (move, trade, harvest, craft, etc.)
- [ ] Create action queue system for entity scheduling
- [ ] Implement behavior trees or state machine for AI decisions
- [ ] Add pathfinding (A\* algorithm) for movement
- [ ] Create basic NPC roles: Farmer, Crafter, Merchant, Governor

**Success Criteria**:

- Entities autonomously move around rooms
- Entities trade items with each other
- Entities change behaviors based on need/state

### 1.2 Interaction System

**Objective**: Define how entities interact with each other and world

**Tasks**:

- [ ] Create interaction protocol (proximity, conversation, trade)
- [ ] Implement trade agreements and negotiation
- [ ] Add relationship/affinity tracking between entities
- [ ] Create task/job system (entities can work together)
- [ ] Add contract/agreement system

**Success Criteria**:

- Two entities can complete a trade sequence
- Entities track relationship changes
- Multiple entities can collaborate on tasks

### 1.3 Economics System

**Objective**: Implement money, resources, and trade mechanics

**Tasks**:

- [ ] Define resource types (wood, stone, food, crafted goods)
- [ ] Create supply/demand dynamics
- [ ] Implement pricing system (market-based or fixed)
- [ ] Add production chains (harvest → craft → trade)
- [ ] Create wealth/poverty tracking

**Success Criteria**:

- Resources can be harvested and crafted
- Prices reflect supply/demand
- Economic disparities emerge over time

## Phase 2: Government & Policy (Priority High)

### 2.1 Government Structure

**Objective**: Implement governance mechanics affecting entities

**Tasks**:

- [ ] Define government types (autocracy, democracy, etc.)
- [ ] Create policy system (rules affecting entity behavior)
- [ ] Implement taxation system
- [ ] Add voting/decision-making for democracies
- [ ] Create government roles (ruler, council, etc.)

**Success Criteria**:

- Government can set and enforce policies
- Policies affect entity behavior (e.g., tax rates change prices)
- Government maintains treasury

### 2.2 Policy System

**Objective**: Design how policies impact simulation

**Tasks**:

- [ ] Define policy types (tax, regulation, incentive)
- [ ] Create policy evaluation rules (when they apply)
- [ ] Add policy enforcement and compliance tracking
- [ ] Implement policy feedback effects
- [ ] Create policy history tracking

**Success Criteria**:

- Policies measurably affect entity behavior
- Policies can be created, modified, and repealed
- Policy effects can be analyzed and measured

### 2.3 Governance Outcomes

**Objective**: Measure and display governance effectiveness

**Tasks**:

- [ ] Create metrics: satisfaction, economic growth, inequality, etc.
- [ ] Implement stability/unrest system
- [ ] Add revolution/upheaval mechanics
- [ ] Create government succession system
- [ ] Add policy logging and history

**Success Criteria**:

- Government effectiveness is measurable
- Bad governance can lead to instability/revolution
- Policy impacts are visible in metrics

## Phase 3: World & Persistence (Priority Medium)

### 3.1 World Structure

**Objective**: Expand from single room to multi-room world

**Tasks**:

- [ ] Implement multi-map system (towns, regions)
- [ ] Create travel/movement between maps
- [ ] Add resource distribution across regions
- [ ] Implement trade routes and commerce flow
- [ ] Create regional variation (climate, resources, etc.)

**Success Criteria**:

- Multiple regions with different characteristics
- Entities can travel between regions
- Inter-regional trade occurs

### 3.2 Time Progression

**Objective**: Add seasons, years, and long-term effects

**Tasks**:

- [ ] Implement calendar system (days, seasons, years)
- [ ] Add seasonal effects (harvest times, difficulty)
- [ ] Create aging for entities
- [ ] Implement generational changes
- [ ] Add historical events/epochs

**Success Criteria**:

- Game spans multiple years of simulation
- Seasonal effects visibly change gameplay
- Entity generations change over time

### 3.3 Persistence & History

**Objective**: Track and preserve long-term simulation history

**Tasks**:

- [ ] Implement entity history tracking
- [ ] Create event log/journal system
- [ ] Add metrics time-series tracking
- [ ] Implement replay system (watch past events)
- [ ] Create narrative generation from events

**Success Criteria**:

- Full history is preserved across saves
- Past events can be reviewed
- Interesting patterns/stories emerge

## Phase 4: Visualization & UI (Priority Medium)

### 4.1 Terminal UI

**Objective**: Create TUI for interacting with simulation

**Tasks**:

- [ ] Design terminal layout (map, stats, controls)
- [ ] Implement entity inspection/selection
- [ ] Create government interface
- [ ] Add policy creation/modification UI
- [ ] Implement settings/configuration panels

**Success Criteria**:

- Can observe and control simulation from terminal
- All key information is accessible
- Controls are responsive and intuitive

### 4.2 Visualization

**Objective**: Display spatial and temporal data clearly

**Tasks**:

- [ ] Create ASCII map rendering
- [ ] Add entity representation (icons/symbols)
- [ ] Implement graph displays (economics, metrics)
- [ ] Create timeline/history visualization
- [ ] Add heatmaps (density, satisfaction, etc.)

**Success Criteria**:

- Visual feedback for all game states
- Complex data is understandable at a glance
- Visualization aids decision-making

## Phase 5: Content & Polish (Priority Low)

### 5.1 Content Expansion

**Objective**: Add diverse content to enrich gameplay

**Tasks**:

- [ ] Create diverse entity types and roles
- [ ] Add more resource types and production chains
- [ ] Implement cultural/social systems
- [ ] Create more government types
- [ ] Add random events and scenarios

**Success Criteria**:

- Multiple playstyles are viable
- Emergent gameplay from content variety
- Replayability is high

### 5.2 Quality & Polish

**Objective**: Refine systems and improve UX

**Tasks**:

- [ ] Balance economic systems
- [ ] Debug and optimize performance
- [ ] Refine AI decision-making
- [ ] Improve save/load reliability
- [ ] Polish UI and controls

**Success Criteria**:

- Game is stable and performant
- No major bugs or issues
- Controls are responsive and intuitive

## Estimated Timeline

**Phase 1 (Mechanics)**: 4-6 weeks

- Critical for core gameplay loop
- Requires frequent testing and iteration

**Phase 2 (Government)**: 6-8 weeks

- Core to game's unique premise
- Requires careful balance and tuning

**Phase 3 (World)**: 4-6 weeks

- Builds on core systems
- Mostly architectural work

**Phase 4 (UI)**: 3-4 weeks

- Polish rather than new functionality
- Can run parallel with other phases

**Phase 5 (Polish)**: 2-4 weeks

- Refinement and content
- Ongoing during other phases

**Total Estimate**: 16-24 weeks to production-ready game

## Success Criteria for Production Release

- [ ] Game loop is stable and performant
- [ ] All core mechanics work as designed
- [ ] Government system meaningfully affects gameplay
- [ ] Policies have measurable economic impacts
- [ ] UI is intuitive and responsive
- [ ] Save/load works reliably
- [ ] No critical bugs
- [ ] Gameplay is engaging and replayable
- [ ] Documentation is complete
- [ ] Code quality is high

## Key Technical Decisions Needed

1. **AI System**: BT vs State Machine vs Rule-based?
2. **Policy Evaluation**: Real-time vs tick-based?
3. **Multi-threading**: Should sim run off main thread?
4. **Persistence Format**: JSON, SQLite, or custom?
5. **Visualization Library**: Terminal UI library choice?

## Dependencies & Blockers

- **Pathfinding**: Required for movement system
- **Trade System**: Required for economic simulation
- **Policy System**: Required for government gameplay
- **UI Framework**: Required for player control

Current blockers: None - POC is complete and functional

## Next Immediate Steps

1. **Week 1**: Implement action queue and basic pathfinding
2. **Week 2**: Create entity behavior tree system
3. **Week 3**: Implement basic trading between entities
4. **Week 4**: Create government structure and policy system
5. **Week 5**: Build metrics and outcome tracking

These steps unblock further development and establish core gameplay loop.
