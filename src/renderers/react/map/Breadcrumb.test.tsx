// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Breadcrumb, mapChain } from "./Breadcrumb";

afterEach(cleanup);

const maps = [
  { id: 1, gridType: "voronoi", parentId: null, cellCount: 600 },
  { id: 2, gridType: "square", parentId: 1, cellCount: 36 },
  { id: 3, gridType: "square", parentId: 2, cellCount: 16 },
];

describe("mapChain", () => {
  it("lists the maps from the outermost down", () => {
    expect(mapChain(maps, 3).map((entry) => entry.id)).toEqual([1, 2, 3]);
    expect(mapChain(maps, 1).map((entry) => entry.id)).toEqual([1]);
    expect(mapChain(maps, 99)).toEqual([]);
  });

  it("survives a parent cycle", () => {
    const cyclic = [
      { id: 1, gridType: "square", parentId: 2, cellCount: 1 },
      { id: 2, gridType: "square", parentId: 1, cellCount: 1 },
    ];
    expect(mapChain(cyclic, 1).length).toBeLessThanOrEqual(3);
  });
});

describe("Breadcrumb", () => {
  it("shows the chain with a way back to the parent", () => {
    const picked: number[] = [];
    render(<Breadcrumb maps={maps} activeId={2} onSelect={(id) => picked.push(id)} />);
    fireEvent.click(screen.getByRole("button", { name: "Back to map 1" }));
    fireEvent.click(screen.getByRole("button", { name: /Map 2/ }));
    expect(picked).toEqual([1, 2]);
    expect(screen.getByRole("button", { name: /Map 2/ }).getAttribute("aria-current")).toBe("page");
  });

  it("renders nothing for a single map", () => {
    const { container } = render(
      <Breadcrumb maps={maps.slice(0, 1)} activeId={1} onSelect={() => undefined} />,
    );
    expect(container.textContent).toBe("");
  });
});
