import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import App from "./App.jsx";

class MockEventSource {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.listeners = {};
    MockEventSource.instances.push(this);
  }
  addEventListener(type, cb) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(cb);
  }
  emit(type, event) {
    (this.listeners[type] || []).forEach((cb) => cb(event));
  }
  close() {}
}

beforeEach(() => {
  MockEventSource.instances = [];
  global.EventSource = MockEventSource;
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      meals: [
        { _id: "a", name: "Roti", quantity: 2, unit: "piece", macros: { calories: 594, protein: 22.4, carbs: 116, fat: 7.4 }, mealType: "lunch", loggedAt: "2026-09-02T12:00:00.000Z" },
      ],
    }),
  });
});

describe("App", () => {
  it("defaults to the Agent screen with sidebar nav visible", () => {
    render(<App />);
    expect(screen.getByText("Talk to Beet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agent" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "Meal Log" })).toBeInTheDocument();
  });

  it("shows StatusLine on the Agent screen for awaiting_confirmation, which the voice orb doesn't cover", () => {
    render(<App />);

    act(() => {
      MockEventSource.instances[0].emit("message", {
        data: JSON.stringify({ type: "agent_status", status: "awaiting_confirmation", targetMealId: "a" }),
      });
    });

    expect(screen.getByText("Agent: awaiting confirmation…")).toBeInTheDocument();
  });

  it("switching to Meal Log shows loaded meals", async () => {
    render(<App />);
    act(() => MockEventSource.instances[0].emit("open", {}));

    fireEvent.click(screen.getByRole("button", { name: "Meal Log" }));

    expect(screen.getByRole("button", { name: "Meal Log" })).toHaveClass("active");
    await waitFor(() => expect(screen.getByText("Roti")).toBeInTheDocument());
  });
});
