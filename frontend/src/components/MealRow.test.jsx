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

  it("shows time-only for a meal logged today", () => {
    const todayMeal = { ...meal, loggedAt: new Date().toISOString() };
    render(<MealRow meal={todayMeal} highlighted={false} />);
    const time = new Date(todayMeal.loggedAt).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    expect(screen.getByText(new RegExp(time.replace(/\s/g, "\\s")))).toBeInTheDocument();
  });

  it("shows date+time for a meal logged on a different day", () => {
    const yesterdayIso = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
    const yesterdayMeal = { ...meal, loggedAt: yesterdayIso };
    render(<MealRow meal={yesterdayMeal} highlighted={false} />);
    const d = new Date(yesterdayIso);
    const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const date = d.toLocaleDateString([], { month: "short", day: "numeric" });
    const expected = `${date} ${time}`;
    expect(screen.getByText(new RegExp(expected.replace(/\s/g, "\\s")))).toBeInTheDocument();
  });
});
