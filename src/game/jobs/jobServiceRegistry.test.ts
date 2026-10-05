import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { JobService } from "./JobService";
import { bindJobService, getJobService } from "./jobServiceRegistry";

describe("jobServiceRegistry", () => {
  it("finds the service the engine registered for itself", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    expect(getJobService(engine)).toBeInstanceOf(JobService);
  });

  it("binds a replacement service per engine", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    const other = new GameEngine(loadContent(), { entropy: () => 1 });
    const service = new JobService();
    bindJobService(engine, service);
    expect(getJobService(engine)).toBe(service);
    expect(getJobService(other)).not.toBe(service);
  });
});
