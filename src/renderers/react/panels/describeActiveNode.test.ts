import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../game/engine/EventBus";
import { describeActiveNode } from "./describeActiveNode";

const tree: JsonValue = {
  type: "selector",
  children: [
    { type: "condition", id: "any_need_below_critical" },
    {
      type: "sequence",
      children: [
        { type: "condition", id: "jobs_available" },
        { type: "action", id: "claim_job" },
      ],
    },
  ],
};

describe("describeActiveNode", () => {
  // @covers 024:FR-007
  it("names the composites on the way and the running leaf", () => {
    expect(describeActiveNode(tree, [1, 1])).toEqual(["selector", "sequence", "claim job"]);
    expect(describeActiveNode(tree, [0])).toEqual(["selector", "any need below critical"]);
  });

  it("stops where the path leaves the tree and answers nothing for an unknown root", () => {
    expect(describeActiveNode(tree, [1, 1, 0, 3])).toEqual(["selector", "sequence", "claim job"]);
    expect(describeActiveNode(tree, [7])).toEqual(["selector"]);
    expect(describeActiveNode(undefined, [0])).toEqual([]);
    expect(describeActiveNode(tree, [])).toEqual(["selector"]);
  });
});
