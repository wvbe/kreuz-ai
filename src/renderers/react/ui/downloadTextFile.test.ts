// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadTextFile } from "./downloadTextFile";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("downloadTextFile", () => {
  it("clicks a temporary link with the file name and releases the URL", () => {
    const created: Blob[] = [];
    const revoked: string[] = [];
    Object.assign(URL, {
      createObjectURL: (blob: Blob) => {
        created.push(blob);
        return "blob:fake";
      },
      revokeObjectURL: (url: string) => {
        revoked.push(url);
      },
    });
    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push(`${this.download}|${this.href}`);
    });
    downloadTextFile("save.json", '{"a":1}');
    expect(clicks).toEqual(["save.json|blob:fake"]);
    expect(created[0]?.size).toBe(7);
    expect(revoked).toEqual(["blob:fake"]);
    expect(document.querySelector("a")).toBeNull();
  });
});
