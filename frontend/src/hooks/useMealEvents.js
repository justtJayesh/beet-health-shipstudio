import { useEffect, useRef, useState, useCallback } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

export function useMealEvents(hours = 48) {
  const [meals, setMeals] = useState([]);
  const [agentStatus, setAgentStatus] = useState(null);
  const [error, setError] = useState(null);
  const sourceRef = useRef(null);

  const fetchMeals = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/meals?hours=${hours}`);
      if (!res.ok) {
        throw new Error(`GET /api/meals failed: ${res.status}`);
      }
      const data = await res.json();
      setMeals(data);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, [hours]);

  useEffect(() => {
    const source = new EventSource(`${API_BASE_URL}/api/events`);
    sourceRef.current = source;

    source.addEventListener("open", () => {
      fetchMeals();
    });

    source.addEventListener("message", (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      if (payload.type === "meal_logged") {
        setMeals((prev) => (prev.some((m) => m._id === payload.meal._id) ? prev : [payload.meal, ...prev]));
      } else if (payload.type === "meal_updated") {
        setMeals((prev) => prev.map((m) => (m._id === payload.meal._id ? payload.meal : m)));
      } else if (payload.type === "meal_deleted") {
        setMeals((prev) => prev.filter((m) => m._id !== payload.meal._id));
      } else if (payload.type === "agent_status") {
        setAgentStatus({ status: payload.status, targetMealId: payload.targetMealId ?? null });
      }
    });

    return () => {
      source.close();
    };
  }, [fetchMeals]);

  return { meals, agentStatus, error, retry: fetchMeals };
}
