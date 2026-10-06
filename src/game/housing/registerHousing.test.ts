import { describe, expect, it } from "vitest";
import { getComponent } from "../ecs/Entity";
import { citizenComponent } from "../factions/citizenComponent";
import { getSettlementService } from "../settlement/settlementServiceRegistry";
import { getStatusService } from "../status/statusServiceRegistry";
import { StatusSubjectKind } from "../status/statusTypes";
import { registerHousing } from "./registerHousing";
import { createHousingWorld } from "./testHousingWorld";

describe("registerHousing", () => {
  it("is idempotent and installs the dwelling counter of the settlement", () => {
    const world = createHousingWorld();
    expect(registerHousing(world.engine)).toBe(registerHousing(world.engine));
    const zone = world.dwelling(2, 2, { beds: 1 });
    expect(world.dwellingData(zone).level).toBe("hovel");
    expect(getSettlementService(world.engine).countDwellingsAtOrAbove("hovel" as never)).toBe(1);
    expect(getSettlementService(world.engine).countDwellingsAtOrAbove("cottage" as never)).toBe(0);
  });

  it("registers the Dwelling status provider", () => {
    const world = createHousingWorld();
    const kinds = getStatusService(world.engine)
      .providers()
      .map((provider) => provider.kind);
    expect(kinds).toContain(StatusSubjectKind.Dwelling);
  });

  it("gives a designated dwelling its Dwelling state when the requirements are met", () => {
    const world = createHousingWorld();
    const zone = world.dwelling(2, 2, { beds: 1 });
    expect(world.dwellingData(zone)).toMatchObject({ level: "hovel", upgradeStreak: 0 });
    expect(getComponent(world.engine.store.require(zone), citizenComponent)).toBeUndefined();
  });
});
