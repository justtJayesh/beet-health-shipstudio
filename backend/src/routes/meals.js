// backend/src/routes/meals.js
import express from "express";
import { Meal } from "../models/Meal.js";
import { DEFAULT_USER_ID } from "../constants.js";
import {
  resolveMealFields,
  FoodResolutionError,
  InvalidUnitError,
} from "../services/mealMacros.js";
import { broadcast } from "../sse/broadcast.js";

function inferMealType(date = new Date()) {
  const hour = date.getHours();
  if (hour < 11) return "breakfast";
  if (hour < 16) return "lunch";
  if (hour < 21) return "dinner";
  return "snack";
}

function respondResolutionError(res, err) {
  if (err instanceof FoodResolutionError) {
    return res.status(422).json({ error: err.outcome, candidates: err.candidates });
  }
  if (err instanceof InvalidUnitError) {
    return res.status(422).json({ error: "invalid_unit", message: err.message });
  }
  throw err;
}

export function createMealsRouter({ index }) {
  const router = express.Router();

  router.post("/", async (req, res, next) => {
    try {
      const { food, quantity, unit, mealType, idempotencyKey } = req.body ?? {};
      if (!food || quantity == null || !unit) {
        return res.status(400).json({ error: "food, quantity, and unit are required" });
      }
      if (!Number.isFinite(Number(quantity))) {
        return res.status(400).json({ error: "invalid_quantity", message: "quantity must be a finite number" });
      }

      if (idempotencyKey) {
        const existing = await Meal.findOne({ userId: DEFAULT_USER_ID, idempotencyKey });
        if (existing) {
          return res.status(200).json({ meal: existing, deduped: true });
        }
      }

      let fields;
      try {
        fields = resolveMealFields({ foodQuery: food, quantity, unit }, index);
      } catch (err) {
        return respondResolutionError(res, err);
      }

      const loggedAt = new Date();
      let meal;
      try {
        meal = await Meal.create({
          userId: DEFAULT_USER_ID,
          ...fields,
          mealType: mealType ?? inferMealType(loggedAt),
          loggedAt,
          idempotencyKey,
        });
      } catch (err) {
        // ponytail: check-then-create race on idempotencyKey — a concurrent
        // request beat us to it. The partial unique index (Task 2) throws
        // E11000; degrade to the same deduped response the pre-check gives.
        if (err.code === 11000 && idempotencyKey) {
          const existing = await Meal.findOne({ userId: DEFAULT_USER_ID, idempotencyKey });
          if (existing) {
            return res.status(200).json({ meal: existing, deduped: true });
          }
        }
        throw err;
      }

      broadcast({ type: "meal_logged", meal });
      return res.status(201).json({ meal });
    } catch (err) {
      next(err);
    }
  });

  router.patch("/:id", async (req, res, next) => {
    try {
      const meal = await Meal.findOne({ _id: req.params.id, userId: DEFAULT_USER_ID });
      if (!meal) {
        return res.status(404).json({ error: "meal_not_found" });
      }

      const { food, quantity, unit, mealType, loggedAt } = req.body ?? {};
      if (quantity != null && !Number.isFinite(Number(quantity))) {
        return res.status(400).json({ error: "invalid_quantity", message: "quantity must be a finite number" });
      }
      const isFieldEdit = food != null || quantity != null || unit != null;

      if (isFieldEdit) {
        let fields;
        try {
          fields = resolveMealFields(
            {
              foodQuery: food ?? meal.name,
              quantity: quantity ?? meal.quantity,
              unit: unit ?? meal.unit,
            },
            index
          );
        } catch (err) {
          return respondResolutionError(res, err);
        }
        Object.assign(meal, fields);
      }

      if (mealType) meal.mealType = mealType;
      if (loggedAt) meal.loggedAt = new Date(loggedAt);

      await meal.save();
      broadcast({ type: "meal_updated", meal });
      return res.json({ meal });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      const meal = await Meal.findOneAndDelete({ _id: req.params.id, userId: DEFAULT_USER_ID });
      if (!meal) {
        return res.status(404).json({ error: "meal_not_found" });
      }
      broadcast({ type: "meal_deleted", meal });
      return res.json({ meal });
    } catch (err) {
      next(err);
    }
  });

  router.get("/", async (req, res, next) => {
    try {
      const query = { userId: DEFAULT_USER_ID };
      if (req.query.since) {
        const since = new Date(req.query.since);
        if (Number.isNaN(since.getTime())) {
          return res.status(400).json({ error: "invalid_since", message: "since must be a valid ISO8601 date" });
        }
        query.loggedAt = { $gte: since };
      } else if (req.query.hours) {
        const hours = Number(req.query.hours);
        if (!Number.isFinite(hours)) {
          return res.status(400).json({ error: "invalid_hours", message: "hours must be a finite number" });
        }
        const hoursAgo = new Date(Date.now() - hours * 60 * 60 * 1000);
        query.loggedAt = { $gte: hoursAgo };
      }
      const meals = await Meal.find(query).sort({ loggedAt: -1 });
      return res.json({ meals });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
