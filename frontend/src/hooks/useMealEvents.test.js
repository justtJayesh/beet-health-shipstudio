import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useMealEvents } from "./useMealEvents.js";

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
  close() {
    this.closed = true;
  }
}

const meal1 = { _id: "m1", name: "Roti", quantity: 2, unit: "piece", macros: { calories: 594, protein: 22.4, carbs: 116, fat: 7.4 }, mealType: "lunch", loggedAt: "2026-09-02T12:00:00.000Z" };
const meal2 = { _id: "m2", name: "Dal", quantity: 1, unit: "katori", macros: { calories: 200, protein: 10, carbs: 30, fat: 5 }, mealType: "lunch", loggedAt: "2026-09-02T12:01:00.000Z" };

beforeEach(() => {
  MockEventSource.instances = [];
  global.EventSource = MockEventSource;
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ meals: [meal2, meal1] }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useMealEvents", () => {
  it("fetches meals on mount", async () => {
    const { result } = renderHook(() => useMealEvents());

    act(() => {
      MockEventSource.instances[0].emit("open", {});
    });

    await waitFor(() => expect(result.current.meals).toHaveLength(2));
    expect(result.current.meals[0]._id).toBe("m2");
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/meals"));
  });

  it("prepends a meal_logged event without duplicating an already-fetched meal", async () => {
    const { result } = renderHook(() => useMealEvents());
    act(() => MockEventSource.instances[0].emit("open", {}));
    await waitFor(() => expect(result.current.meals).toHaveLength(2));

    const meal3 = { ...meal1, _id: "m3", name: "Chai" };
    act(() => {
      MockEventSource.instances[0].emit("message", { data: JSON.stringify({ type: "meal_logged", meal: meal3 }) });
    });

    expect(result.current.meals).toHaveLength(3);
    expect(result.current.meals[0]._id).toBe("m3");
  });

  it("ignores a meal_logged event for an already-fetched meal (no duplicate)", async () => {
    const { result } = renderHook(() => useMealEvents());
    act(() => MockEventSource.instances[0].emit("open", {}));
    await waitFor(() => expect(result.current.meals).toHaveLength(2));

    act(() => {
      MockEventSource.instances[0].emit("message", { data: JSON.stringify({ type: "meal_logged", meal: meal1 }) });
    });

    expect(result.current.meals).toHaveLength(2);
  });

  it("ignores a malformed-but-parseable event with no meal field", async () => {
    const { result } = renderHook(() => useMealEvents());
    act(() => MockEventSource.instances[0].emit("open", {}));
    await waitFor(() => expect(result.current.meals).toHaveLength(2));

    expect(() => {
      act(() => {
        MockEventSource.instances[0].emit("message", { data: JSON.stringify({ type: "meal_updated" }) });
      });
    }).not.toThrow();

    expect(result.current.meals).toHaveLength(2);
  });

  it("replaces a meal on meal_updated", async () => {
    const { result } = renderHook(() => useMealEvents());
    act(() => MockEventSource.instances[0].emit("open", {}));
    await waitFor(() => expect(result.current.meals).toHaveLength(2));

    const updated = { ...meal1, quantity: 5 };
    act(() => {
      MockEventSource.instances[0].emit("message", { data: JSON.stringify({ type: "meal_updated", meal: updated }) });
    });

    expect(result.current.meals.find((m) => m._id === "m1").quantity).toBe(5);
  });

  it("removes a meal on meal_deleted", async () => {
    const { result } = renderHook(() => useMealEvents());
    act(() => MockEventSource.instances[0].emit("open", {}));
    await waitFor(() => expect(result.current.meals).toHaveLength(2));

    act(() => {
      MockEventSource.instances[0].emit("message", { data: JSON.stringify({ type: "meal_deleted", meal: meal1 }) });
    });

    expect(result.current.meals).toHaveLength(1);
    expect(result.current.meals.find((m) => m._id === "m1")).toBeUndefined();
  });

  it("updates agentStatus on agent_status without touching meals", async () => {
    const { result } = renderHook(() => useMealEvents());
    act(() => MockEventSource.instances[0].emit("open", {}));
    await waitFor(() => expect(result.current.meals).toHaveLength(2));

    act(() => {
      MockEventSource.instances[0].emit("message", {
        data: JSON.stringify({ type: "agent_status", status: "awaiting_confirmation", targetMealId: "m1" }),
      });
    });

    expect(result.current.agentStatus).toEqual({ status: "awaiting_confirmation", targetMealId: "m1" });
    expect(result.current.meals).toHaveLength(2);
  });

  it("clears agentStatus via clearAgentStatus", async () => {
    const { result } = renderHook(() => useMealEvents());
    act(() => MockEventSource.instances[0].emit("open", {}));
    await waitFor(() => expect(result.current.meals).toHaveLength(2));

    act(() => {
      MockEventSource.instances[0].emit("message", {
        data: JSON.stringify({ type: "agent_status", status: "listening" }),
      });
    });
    expect(result.current.agentStatus).toEqual({ status: "listening", targetMealId: null });

    act(() => result.current.clearAgentStatus());

    expect(result.current.agentStatus).toBeNull();
  });

  it("refetches on a second open event (reconnect)", async () => {
    const { result } = renderHook(() => useMealEvents());
    act(() => MockEventSource.instances[0].emit("open", {}));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ meals: [meal1] }) });
    act(() => MockEventSource.instances[0].emit("open", {}));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.meals).toHaveLength(1));
  });

  it("sets error on fetch failure and clears it via retry", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const { result } = renderHook(() => useMealEvents());
    act(() => MockEventSource.instances[0].emit("open", {}));

    await waitFor(() => expect(result.current.error).toBeTruthy());

    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ meals: [meal1] }) });
    await act(async () => {
      await result.current.retry();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.meals).toHaveLength(1);
  });
});
