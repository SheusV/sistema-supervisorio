import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { frame } from "./test/fixture";
const state = vi.hoisted(() => ({
  snapshot: null as ReturnType<typeof frame> | null,
  connection: "live" as "live" | "offline",
}));
vi.mock("./tags/useTags", () => ({ useTags: () => state }));
describe("supervision", () => {
  beforeEach(() => {
    state.snapshot = frame();
    state.connection = "live";
  });
  it("renders simulation and updates the tank on new data", () => {
    const { rerender } = render(<App />);
    expect(screen.getByText("◉ SIMULAÇÃO")).toBeInTheDocument();
    expect(screen.getByTestId("level-value")).toHaveTextContent("42.0");
    expect(screen.getByTestId("tank-water")).toHaveAttribute("height", "105");
    state.snapshot = frame(2, 70);
    rerender(<App />);
    expect(screen.getByTestId("tank-water")).toHaveAttribute("height", "175");
  });
  it("hides measurements on disconnection and bad quality", () => {
    const { rerender } = render(<App />);
    state.connection = "offline";
    rerender(<App />);
    expect(screen.getByTestId("level-value")).toHaveTextContent("—");
    expect(screen.getByRole("status")).toHaveTextContent("Sem conexão");
    state.connection = "live";
    state.snapshot!.tags[0].quality = "BAD";
    rerender(<App />);
    expect(screen.getByTestId("level-value")).toHaveTextContent("—");
  });
  it("navigates to tags and opens offline help with F1", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Tags" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "F1" });
    expect(screen.getByText("Primeiros passos")).toBeInTheDocument();
  });
});
