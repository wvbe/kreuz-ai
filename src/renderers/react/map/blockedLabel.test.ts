import { describe, expect, it } from "vitest";
import { blockedLabel } from "./blockedLabel";

describe("blockedLabel", () => {
  it("splits PascalCase into words", () => {
    expect(blockedLabel("MissingInput")).toBe("Missing input");
    expect(blockedLabel("NoJobsAvailable")).toBe("No jobs available");
    expect(blockedLabel("Unexplained")).toBe("Unexplained");
  });

  it("never returns an empty label", () => {
    expect(blockedLabel("")).toBe("Blocked");
  });
});
