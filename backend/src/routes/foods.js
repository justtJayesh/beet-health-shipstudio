// backend/src/routes/foods.js
import express from "express";
import { resolveFood } from "../services/foodsResolver.js";

export function createFoodsRouter({ index }) {
  const router = express.Router();

  router.get("/resolve", (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    if (!q.trim()) {
      return res.status(400).json({ error: "missing required query param \"q\"" });
    }

    const result = resolveFood(q, index);

    if (result.outcome === "match") {
      return res.json({
        outcome: "match",
        food: { id: result.food.id, name: result.food.name, units: result.food.units },
        matchType: result.matchType,
      });
    }
    if (result.outcome === "ambiguous") {
      return res.json({ outcome: "ambiguous", candidates: result.candidates });
    }
    return res.json({ outcome: "no_match" });
  });

  return router;
}
