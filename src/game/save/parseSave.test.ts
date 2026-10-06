import { describe, expect, it } from "vitest";
import type { JsonValue } from "../engine/EventBus";
import { InvalidSaveFormatError } from "./InvalidSaveFormatError";
import { isoTimestampPattern, parseSave } from "./parseSave";
import { saveGame } from "./saveGame";
import { currentSaveVersion } from "./saveTypes";
import { createSaveWorld } from "./testSaveWorld";
import { UnsupportedSaveVersionError } from "./UnsupportedSaveVersionError";

type Root = { [key: string]: JsonValue };

function freshRoot(): { root: Root; options: { sections: ReturnType<typeof sectionsOf> } } {
  const world = createSaveWorld();
  world.pipeline.runTicks(10);
  const root = JSON.parse(saveGame(world.parts)) as Root;
  return { root, options: { sections: sectionsOf(world) } };
}

function without(root: Root, ...keys: string[]): Root {
  const copy: Root = { ...root };
  for (const key of keys) {
    delete copy[key];
  }
  return copy;
}

function sectionsOf(world: ReturnType<typeof createSaveWorld>) {
  return world.parts.sections;
}

function v0Root(root: Root): Root {
  const old: Root = { ...root, version: 0 };
  delete old["counters"];
  delete old["systems"];
  old["initOptions"] = { ...(root["initOptions"] as Root), difficulty: "normal" };
  return old;
}

describe("isoTimestampPattern", () => {
  // @covers 006:FR-006a
  it("matches ISO 8601 UTC with milliseconds only", () => {
    expect(isoTimestampPattern.test("2026-10-05T12:00:00.000Z")).toBe(true);
    expect(isoTimestampPattern.test("2026-10-05")).toBe(false);
    expect(isoTimestampPattern.test("2026-10-05T12:00:00+02:00")).toBe(false);
  });
});

describe("parseSave", () => {
  it("parses save text and an equivalent object to the same result", () => {
    const { root, options } = freshRoot();
    const fromText = parseSave(JSON.stringify(root), options);
    const fromObject = parseSave(root, options);
    expect(fromObject).toEqual(fromText);
    expect(fromText.originalVersion).toBe(currentSaveVersion);
    expect(fromText.core.entities).toHaveLength(3);
    expect(fromText.rootSections).toEqual({ statuses: { ticksSeen: 10 } });
    expect(fromText.systems).toEqual({ trade: { bells: 0 } });
  });

  it("does not modify an object input", () => {
    const { root, options } = freshRoot();
    const before = JSON.stringify(root);
    parseSave(root, options);
    expect(JSON.stringify(root)).toBe(before);
  });

  it("rejects text that is not JSON, including truncated saves", () => {
    const { root, options } = freshRoot();
    const text = JSON.stringify(root);
    expect(() => parseSave("not json", options)).toThrow(InvalidSaveFormatError);
    expect(() => parseSave(text.slice(0, text.length - 20), options)).toThrow(/not valid JSON/);
    expect(() => parseSave("", options)).toThrow(InvalidSaveFormatError);
  });

  // @covers 006:FR-014
  it("rejects non-object roots and fractional numbers", () => {
    const { root, options } = freshRoot();
    expect(() => parseSave("[1]", options)).toThrow(/must be a JSON object/);
    expect(() => parseSave("3", options)).toThrow(InvalidSaveFormatError);
    const fractional = { ...root, time: { ...(root["time"] as Root), tickCount: 1.5 } };
    expect(() => parseSave(JSON.stringify(fractional), options)).toThrow(/plain integer JSON/);
    expect(() => parseSave({ ...root, time: { tickCount: 1.5 } }, options)).toThrow(
      /plain integer JSON/,
    );
  });

  // @covers 006:FR-001
  it("rejects a missing, fractional or negative version", () => {
    const { root, options } = freshRoot();
    expect(() => parseSave(without(root, "version"), options)).toThrow(/valid integer version/);
    expect(() => parseSave({ ...root, version: "1" }, options)).toThrow(InvalidSaveFormatError);
    expect(() => parseSave({ ...root, version: -1 }, options)).toThrow(InvalidSaveFormatError);
  });

  // @covers 006:FR-012
  it("rejects a newer version with UnsupportedSaveVersionError", () => {
    const { root, options } = freshRoot();
    const attempt = (): void => {
      parseSave({ ...root, version: currentSaveVersion + 1 }, options);
    };
    expect(attempt).toThrow(UnsupportedSaveVersionError);
    expect(attempt).toThrow(/newer/);
  });

  it("rejects unknown root keys (strict root) and names them", () => {
    const { root, options } = freshRoot();
    try {
      parseSave({ ...root, cheats: 1 }, options);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidSaveFormatError);
      expect((error as InvalidSaveFormatError).issues).toContain("cheats: unknown root key");
    }
  });

  it("rejects missing core keys and malformed core parts, listing every issue", () => {
    const { root, options } = freshRoot();
    const broken = without(root, "prng", "maps");
    try {
      parseSave({ ...broken, time: "soon" }, options);
      expect.unreachable();
    } catch (error) {
      const issues = (error as InvalidSaveFormatError).issues;
      expect(issues.some((line) => line.startsWith("prng"))).toBe(true);
      expect(issues.some((line) => line.startsWith("maps"))).toBe(true);
      expect(issues.some((line) => line.startsWith("time"))).toBe(true);
    }
  });

  it("rejects a bad timestamp and a bad event queue entry", () => {
    const { root, options } = freshRoot();
    expect(() => parseSave({ ...root, timestamp: "yesterday" }, options)).toThrow(/ISO 8601/);
    expect(() =>
      parseSave({ ...root, eventQueue: { queue: [{ name: "a.b", payload: 1 }] } }, options),
    ).toThrow(InvalidSaveFormatError);
  });

  it("ignores unknown initOptions fields but rejects invalid ones (DECISIONS D-05)", () => {
    const { root, options } = freshRoot();
    const withTypo = { ...root, initOptions: { ...(root["initOptions"] as Root), typo: 1 } };
    expect(parseSave(withTypo, options).core.initOptions).toEqual(root["initOptions"]);
    const badSeed = { ...root, initOptions: { ...(root["initOptions"] as Root), seed: -4 } };
    expect(() => parseSave(badSeed, options)).toThrow(InvalidSaveFormatError);
  });

  it("requires registered sections and validates them", () => {
    const { root, options } = freshRoot();
    expect(() => parseSave(without(root, "statuses"), options)).toThrow(
      /statuses: required section/,
    );
    expect(() => parseSave({ ...root, statuses: { ticksSeen: -1 } }, options)).toThrow(/statuses/);
    expect(() => parseSave({ ...root, systems: {} }, options)).toThrow(
      /systems.trade: required section/,
    );
    expect(() =>
      parseSave({ ...root, systems: { trade: { bells: "x" }, ghost: 1 } }, options),
    ).toThrow(InvalidSaveFormatError);
  });

  it("rejects systems entries nobody registered", () => {
    const { root, options } = freshRoot();
    try {
      parseSave({ ...root, systems: { trade: { bells: 0 }, ghost: 1 } }, options);
      expect.unreachable();
    } catch (error) {
      expect((error as InvalidSaveFormatError).issues).toContain(
        "systems.ghost: unknown system section",
      );
    }
  });

  // @covers 006:FR-016
  // @covers 006:SC-005
  it("migrates a version 0 save forward: counters, systems default, difficulty rename", () => {
    const { root, options } = freshRoot();
    const parsed = parseSave(v0Root(root), options);
    expect(parsed.originalVersion).toBe(0);
    expect(parsed.core.initOptions.difficulty).toBe("steady");
    expect(parsed.core.counters).toMatchObject({ nextEntityId: 4, nextMapId: 3 });
    expect(parsed.systems).toEqual({ trade: { bells: 0 } });
  });

  it("still requires current-version saves to carry every registered section", () => {
    const { root, options } = freshRoot();
    expect(() => parseSave(without(root, "systems"), options)).toThrow(InvalidSaveFormatError);
  });
});
