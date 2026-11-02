// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { HERO_TEMPLATES } from "../data/heroes.js";
import { normalizeTiles } from "../board/tileDefs.js";
import { createHero, gameReducer, initialState } from "../state/game.js";
import ProjectorBoard, {
  Board3DToggle,
  useBoard3D,
} from "./ProjectorBoard.jsx";
import { reloadBoard3D } from "./board3dSwitch.js";

const TILES = normalizeTiles(
  [
    {
      id: "start",
      kind: "start",
      rows: ["....", "....", "....", "....", "....", "....", "....", "...."],
      exits: { N: "oooo", S: "oooo", W: "oooooooo", E: "oooooooo" },
    },
  ],
  [],
);
const game = () => ({
  ...gameReducer(initialState, {
    type: "START_GAME",
    heroes: HERO_TEMPLATES.slice(0, 2).map((t) => createHero(t)),
    tileRandom: [],
    boardTiles: TILES,
  }),
  firstRoll: null,
});

beforeAll(() => {
  Element.prototype.scrollTo ??= function () {};
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  reloadBoard3D();
});

function Switchable({ state }) {
  const [on, toggle] = useBoard3D();
  return (
    <>
      <Board3DToggle on={on} toggle={toggle} />
      <ProjectorBoard state={state} on={on} />
    </>
  );
}

describe("the projector 3D switch", () => {
  it("is on at first, and shows the flat board where 3D can't be drawn", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    // The 3D board's code loaded first: the flat board also stands in while it loads, so
    // the test checks the board that's left once 3D has tried (and failed) to draw.
    await import("./Board3D.jsx");
    const c = render(<Switchable state={game()} />);
    expect(c.getByRole("button", { name: /3D board on/ })).toBeTruthy();
    // jsdom has no WebGL: the flat board stands in instead of a blank screen.
    await waitFor(
      () => expect(c.container.querySelector("[data-token]")).toBeTruthy(),
      { timeout: 15000 },
    );
    await new Promise((r) => setTimeout(r, 300));
    await waitFor(
      () => {
        expect(c.container.querySelector("[data-board3d]")).toBeNull();
        expect(c.container.querySelector("[data-token]")).toBeTruthy();
      },
      { timeout: 15000 },
    );
    warn.mockRestore();
    error.mockRestore();
  }, 20000);

  it("remembers being turned off", () => {
    const c = render(<Switchable state={game()} />);
    fireEvent.click(c.getByRole("button", { name: /3D board on/ }));
    expect(localStorage.getItem("ashardalon-board3d")).toBe("off");
    expect(c.getByRole("button", { name: /3D board off/ })).toBeTruthy();
    expect(c.container.querySelector("[data-token]")).toBeTruthy();
  });
});
