import mongoose from "mongoose";

const MacrosSchema = new mongoose.Schema(
  {
    calories: { type: Number, required: true },
    protein: { type: Number, required: true },
    carbs: { type: Number, required: true },
    fat: { type: Number, required: true },
  },
  { _id: false }
);

const MealSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    foodId: { type: String, required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, required: true },
    grams: { type: Number, required: true, min: 0 },
    macros: { type: MacrosSchema, required: true },
    mealType: {
      type: String,
      enum: ["breakfast", "lunch", "dinner", "snack"],
      required: true,
    },
    loggedAt: { type: Date, required: true },
    // Optional. When present, a retried log_meal call with the same key
    // for the same user returns the existing meal instead of duplicating it.
    idempotencyKey: { type: String },
  },
  { timestamps: true }
);

// Recency-scoped list query (GET /api/meals, find_recent_meals) — see
// Performance Review in the design doc.
MealSchema.index({ userId: 1, loggedAt: -1 });

// Unique only when idempotencyKey is actually a string, so meals without
// one (the common case) never collide with each other.
MealSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } }
);

export const Meal = mongoose.model("Meal", MealSchema);
