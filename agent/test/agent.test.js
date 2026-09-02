// agent/test/agent.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildAgent } from "../src/agent.js";

const foodsById = new Map([
  ["roti", { id: "roti", name: "Roti", aliases: ["chapati"], units: [{ name: "piece", grams: 40 }] }],
]);

function makeBackendClient() {
  return {
    logMeal: vi.fn().mockResolvedValue({ body: { meal: { _id: "m1" } } }),
    editMeal: vi.fn().mockResolvedValue({ body: {} }),
    deleteMeal: vi.fn().mockResolvedValue({ body: {} }),
    listMeals: vi.fn().mockResolvedValue({ body: { meals: [] } }),
  };
}

describe("buildAgent confirmation lifecycle", () => {
  let backendClient;
  let agent;
  let confirmationState;

  beforeEach(() => {
    backendClient = makeBackendClient();
    ({ agent, confirmationState } = buildAgent({ backendClient, foodsById }));
  });

  function toolExecute(name) {
    return agent.toolCtx.functionTools[name].execute;
  }

  it("sets pending state when request_confirmation is called for a delete", async () => {
    await toolExecute("request_confirmation")({ target_meal_id: "m1" });
    expect(confirmationState).toEqual({ pending: true, pendingTargetMealId: "m1" });
  });

  it("clears pending state when delete_meal actually runs (user confirmed)", async () => {
    await toolExecute("request_confirmation")({ target_meal_id: "m1" });
    await toolExecute("delete_meal")({ meal_id: "m1" });
    expect(confirmationState).toEqual({ pending: false, pendingTargetMealId: undefined });
    expect(backendClient.deleteMeal).toHaveBeenCalledWith("m1");
  });

  it("clears pending state when the user declines via cancel_confirmation", async () => {
    await toolExecute("request_confirmation")({ target_meal_id: "m1" });
    await toolExecute("cancel_confirmation")({});
    expect(confirmationState).toEqual({ pending: false, pendingTargetMealId: undefined });
    expect(backendClient.deleteMeal).not.toHaveBeenCalled();
  });

  it("does not leave a stale target_meal_id stuck after decline and a later unrelated log", async () => {
    await toolExecute("request_confirmation")({ target_meal_id: "m1" });
    await toolExecute("cancel_confirmation")({});
    await toolExecute("log_meal")({ food: "roti", quantity: 2, unit: "piece" });
    expect(confirmationState.pending).toBe(false);
  });
});
