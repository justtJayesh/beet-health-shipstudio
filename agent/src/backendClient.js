// agent/src/backendClient.js
import { randomUUID } from "node:crypto";

export function createBackendClient({ baseUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:3001" } = {}) {
  async function request(path, options = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (res.status === 204) {
      return { status: 204, body: null };
    }
    return { status: res.status, body: await res.json() };
  }

  return {
    logMeal({ food, quantity, unit, mealType }) {
      return request("/api/meals", {
        method: "POST",
        body: JSON.stringify({ food, quantity, unit, mealType, idempotencyKey: randomUUID() }),
      });
    },

    editMeal(mealId, { food, quantity, unit, mealType, loggedAt } = {}) {
      return request(`/api/meals/${mealId}`, {
        method: "PATCH",
        body: JSON.stringify({ food, quantity, unit, mealType, loggedAt, idempotencyKey: randomUUID() }),
      });
    },

    deleteMeal(mealId) {
      return request(`/api/meals/${mealId}`, { method: "DELETE" });
    },

    listMeals({ hours } = {}) {
      const query = hours != null ? `?hours=${hours}` : "";
      return request(`/api/meals${query}`, { method: "GET" });
    },

    async postAgentStatus({ status, targetMealId }) {
      const payload = targetMealId != null ? { status, targetMealId } : { status };
      await request("/api/agent-status", { method: "POST", body: JSON.stringify(payload) });
    },
  };
}
