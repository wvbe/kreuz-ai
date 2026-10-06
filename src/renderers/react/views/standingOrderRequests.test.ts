import { afterEach, describe, expect, it } from "vitest";
import {
  openStandingOrderForm,
  rememberStandingOrderMaterial,
  setStandingOrderFormOpener,
  takeStandingOrderMaterial,
} from "./standingOrderRequests";

afterEach(() => setStandingOrderFormOpener(null));

describe("standingOrderRequests", () => {
  it("is a no-op until a panel registers an opener", () => {
    expect(() => openStandingOrderForm("bread")).not.toThrow();
  });

  it("hands the material to the registered opener and can be reset", () => {
    const seen: string[] = [];
    setStandingOrderFormOpener((materialId) => seen.push(materialId));
    openStandingOrderForm("bread");
    setStandingOrderFormOpener(null);
    openStandingOrderForm("flour");
    expect(seen).toEqual(["bread"]);
  });

  it("remembers the material of a request until the standing-orders tab takes it, once", () => {
    expect(takeStandingOrderMaterial()).toBeNull();
    rememberStandingOrderMaterial("bread");
    expect(takeStandingOrderMaterial()).toBe("bread");
    expect(takeStandingOrderMaterial()).toBeNull();
  });
});
