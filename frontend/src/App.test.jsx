import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
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
  it("renders the title and loaded meals", async () => {
    render(<App />);
    expect(screen.getByText(/Meal Log/i)).toBeInTheDocument();

    act(() => MockEventSource.instances[0].emit("open", {}));

    await waitFor(() => expect(screen.getByText("Roti")).toBeInTheDocument());
  });

  it("renders the status line once an agent_status event arrives", async () => {
    render(<App />);
    act(() => MockEventSource.instances[0].emit("open", {}));
    await waitFor(() => expect(screen.getByText("Roti")).toBeInTheDocument());

    act(() => {
      MockEventSource.instances[0].emit("message", {
        data: JSON.stringify({ type: "agent_status", status: "listening" }),
      });
    });

    expect(screen.getByText("Agent: listening…")).toBeInTheDocument();
  });
});
