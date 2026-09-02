import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MealList } from "./MealList.jsx";

const mealA = { _id: "a", name: "Roti", quantity: 2, unit: "piece", macros: { calories: 594, protein: 22.4, carbs: 116, fat: 7.4 }, mealType: "lunch", loggedAt: "2026-09-02T12:00:00.000Z" };
const mealB = { _id: "b", name: "Dal", quantity: 1, unit: "katori", macros: { calories: 200, protein: 10, carbs: 30, fat: 5 }, mealType: "lunch", loggedAt: "2026-09-02T12:05:00.000Z" };

describe("MealList", () => {
  it("renders meals in the order given (caller controls newest-first)", () => {
    render(<MealList meals={[mealB, mealA]} agentStatus={null} error={null} onRetry={() => {}} />);
    const names = screen.getAllByText(/Roti|Dal/).map((el) => el.textContent);
    expect(names).toEqual(["Dal", "Roti"]);
  });

  it("renders EmptyState when meals is empty", () => {
    render(<MealList meals={[]} agentStatus={null} error={null} onRetry={() => {}} />);
    expect(screen.getByText(/No meals logged yet/)).toBeInTheDocument();
  });

  it("renders a retry banner when error is set, and calls onRetry on click", () => {
    const onRetry = vi.fn();
    render(<MealList meals={[]} agentStatus={null} error={new Error("boom")} onRetry={onRetry} />);
    const button = screen.getByRole("button", { name: /retry/i });
    button.click();
    expect(onRetry).toHaveBeenCalled();
  });

  it("highlights the meal matching targetMealId during awaiting_confirmation", () => {
    const { container } = render(
      <MealList
        meals={[mealA, mealB]}
        agentStatus={{ status: "awaiting_confirmation", targetMealId: "a" }}
        error={null}
        onRetry={() => {}}
      />
    );
    const rows = container.querySelectorAll(".meal-row");
    expect(rows[0]).toHaveClass("highlighted");
    expect(rows[1]).not.toHaveClass("highlighted");
  });
});
