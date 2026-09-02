import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MealRow } from "./MealRow.jsx";

const meal = {
  _id: "m1",
  name: "Roti",
  quantity: 2,
  unit: "piece",
  macros: { calories: 594, protein: 22.4, carbs: 116, fat: 7.4 },
  mealType: "lunch",
  loggedAt: "2026-09-02T12:00:00.000Z",
};

describe("MealRow", () => {
  it("renders name, quantity+unit, mealType, and macros", () => {
    render(<MealRow meal={meal} highlighted={false} />);
    expect(screen.getByText("Roti")).toBeInTheDocument();
    expect(screen.getByText(/2 piece/)).toBeInTheDocument();
    expect(screen.getByText(/lunch/)).toBeInTheDocument();
    expect(screen.getByText(/594 kcal/)).toBeInTheDocument();
  });

  it("applies the highlighted class when highlighted is true", () => {
    const { container } = render(<MealRow meal={meal} highlighted={true} />);
    expect(container.firstChild).toHaveClass("highlighted");
  });

  it("does not apply the highlighted class when highlighted is false", () => {
    const { container } = render(<MealRow meal={meal} highlighted={false} />);
    expect(container.firstChild).not.toHaveClass("highlighted");
  });
});
