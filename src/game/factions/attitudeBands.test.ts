import { describe, expect, it } from "vitest";
import { Attitude, attitudeOfValue, attitudeOrder } from "./attitudeBands";

const thresholds = { hostileStanding: -30, friendlyStanding: 20, alliedStanding: 70 };

describe("attitudeOfValue", () => {
  it.each([
    [-100, Attitude.Hostile],
    [-31, Attitude.Hostile],
    [-30, Attitude.Wary],
    [-1, Attitude.Wary],
    [0, Attitude.Neutral],
    [19, Attitude.Neutral],
    [20, Attitude.Friendly],
    [69, Attitude.Friendly],
    [70, Attitude.Allied],
    [100, Attitude.Allied],
  ])("puts standing %i in band %s", (value, expected) => {
    expect(attitudeOfValue(thresholds, value)).toBe(expected);
  });

  it("reads the thresholds it is given", () => {
    expect(attitudeOfValue({ ...thresholds, friendlyStanding: 10 }, 10)).toBe(Attitude.Friendly);
  });
});

describe("attitudeOrder", () => {
  it("lists the five bands from hostile to allied", () => {
    expect(attitudeOrder).toEqual([
      Attitude.Hostile,
      Attitude.Wary,
      Attitude.Neutral,
      Attitude.Friendly,
      Attitude.Allied,
    ]);
  });
});
