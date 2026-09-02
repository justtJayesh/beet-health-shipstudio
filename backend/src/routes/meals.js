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

  router.post("/", async (req, res) => {
    const { food, quantity, unit, mealType, idempotencyKey } = req.body ?? {};
    if (!food || quantity == null || !unit) {
      return res.status(400).json({ error: "food, quantity, and unit are required" });
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
    const meal = await Meal.create({
      userId: DEFAULT_USER_ID,
      ...fields,
      mealType: mealType ?? inferMealType(loggedAt),
      loggedAt,
      idempotencyKey,
    });

    broadcast({ type: "meal_logged", meal });
    return res.status(201).json({ meal });
  });

  router.patch("/:id", async (req, res) => {
    const meal = await Meal.findOne({ _id: req.params.id, userId: DEFAULT_USER_ID });
    if (!meal) {
      return res.status(404).json({ error: "meal_not_found" });
    }

    const { food, quantity, unit, mealType, loggedAt } = req.body ?? {};
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
  });

  router.delete("/:id", async (req, res) => {
    const meal = await Meal.findOneAndDelete({ _id: req.params.id, userId: DEFAULT_USER_ID });
    if (!meal) {
      return res.status(404).json({ error: "meal_not_found" });
    }
    broadcast({ type: "meal_deleted", meal });
    return res.json({ meal });
  });

  router.get("/", async (req, res) => {
    const query = { userId: DEFAULT_USER_ID };
    if (req.query.since) {
      query.loggedAt = { $gte: new Date(req.query.since) };
    } else if (req.query.hours) {
      const hoursAgo = new Date(Date.now() - Number(req.query.hours) * 60 * 60 * 1000);
      query.loggedAt = { $gte: hoursAgo };
    }
    const meals = await Meal.find(query).sort({ loggedAt: -1 });
    return res.json({ meals });
  });

  return router;
}
