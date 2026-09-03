import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Sidebar } from "./Sidebar.jsx";

describe("Sidebar", () => {
  it("renders Agent and Meal Log nav items", () => {
    render(<Sidebar active="agent" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: "Agent" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Meal Log" })).toBeInTheDocument();
  });

  it("marks the active item", () => {
    render(<Sidebar active="meallog" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: "Meal Log" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "Agent" })).not.toHaveClass("active");
  });

  it("calls onSelect with the clicked item's key", () => {
    const onSelect = vi.fn();
    render(<Sidebar active="agent" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Meal Log" }));
    expect(onSelect).toHaveBeenCalledWith("meallog");
  });
});
