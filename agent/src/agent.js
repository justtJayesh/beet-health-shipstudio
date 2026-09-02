// agent/src/agent.js
import { Agent, tool } from "@livekit/agents";
import { z } from "zod";
import { isImplausible } from "./quantityGuard.js";

function foodNamesList(foodsById) {
  return Array.from(foodsById.values())
    .map((food) => food.name)
    .join(", ");
}

export function buildAgent({ backendClient, foodsById }) {
  const logMealTool = tool({
    description:
      "Log one food item the user says they ate. Call this once per distinct food item — " +
      "if the user mentions multiple foods in one sentence, call this tool separately for each one.",
    parameters: z.object({
      food: z.string().describe("The food name or alias as the user said it"),
      quantity: z.number().describe("How many units of the food"),
      unit: z.string().describe("The household unit, e.g. piece, katori, plate, gram"),
      mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
    }),
    execute: async ({ food, quantity, unit, mealType }) => {
      const result = await backendClient.logMeal({ food, quantity, unit, mealType });
      return result.body;
    },
  });

  const editMealTool = tool({
    description: "Edit a previously logged meal, identified by its meal_id (use find_recent_meals first if you don't already have it).",
    parameters: z.object({
      meal_id: z.string(),
      food: z.string().optional(),
      quantity: z.number().optional(),
      unit: z.string().optional(),
      mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
      loggedAt: z.string().optional().describe("ISO8601 timestamp"),
    }),
    execute: async ({ meal_id, food, quantity, unit, mealType, loggedAt }) => {
      const result = await backendClient.editMeal(meal_id, { food, quantity, unit, mealType, loggedAt });
      return result.body;
    },
  });

  const deleteMealTool = tool({
    description:
      "Permanently delete a logged meal, identified by its meal_id. " +
      "Only call this after the user has explicitly confirmed the deletion in the current turn — " +
      "never call it on the first mention of wanting to delete something.",
    parameters: z.object({ meal_id: z.string() }),
    execute: async ({ meal_id }) => {
      const result = await backendClient.deleteMeal(meal_id);
      return result.body;
    },
  });

  const findRecentMealsTool = tool({
    description: "List the user's recently logged meals, most recent first. Use this to find a meal_id before editing or deleting.",
    parameters: z.object({
      hours: z.number().optional().describe("Only return meals logged within this many hours. Omit to list everything."),
    }),
    execute: async ({ hours }) => {
      const result = await backendClient.listMeals({ hours });
      return result.body;
    },
  });

  const checkQuantityTool = tool({
    description:
      "Before calling log_meal or edit_meal, call this with the resolved food id, quantity, and unit " +
      "to check whether the quantity looks like a misheard/implausible amount that needs the user's " +
      "confirmation before logging. If it returns implausible=true, ask the user to confirm the amount " +
      "out loud before calling log_meal/edit_meal.",
    parameters: z.object({
      food_id: z.string().describe("The resolved food id, e.g. \"roti\" — not the spoken phrase"),
      quantity: z.number(),
      unit: z.string(),
    }),
    execute: async ({ food_id, quantity, unit }) => {
      try {
        const implausible = isImplausible({ foodId: food_id, quantity, unit, foodsById });
        return { implausible };
      } catch {
        // Unknown food/unit at this stage just means "let log_meal's own
        // resolution handle it" — not this tool's job to validate existence.
        return { implausible: false };
      }
    },
  });

  const requestConfirmationTool = tool({
    description:
      "Call this immediately before speaking a delete confirmation question or a quantity confirmation question — right before you ask the user to confirm, not after. " +
      "This lets the app show the user that you're waiting for their confirmation.",
    parameters: z.object({
      target_meal_id: z.string().optional().describe("The meal_id being confirmed for deletion, if applicable. Omit for a new/not-yet-logged meal's quantity confirmation."),
    }),
    execute: async ({ target_meal_id }) => {
      await backendClient.postAgentStatus({ status: "awaiting_confirmation", targetMealId: target_meal_id });
      return { ok: true };
    },
  });

  return new Agent({
    instructions:
      "You are Beet, a voice assistant that logs meals for one user. You can ONLY log foods from " +
      `this closed list: ${foodNamesList(foodsById)}. If the user mentions a food not on this list, ` +
      "tell them it's not in the food list rather than guessing or logging something close. " +
      "For each distinct food item the user mentions, call log_meal once. " +
      "Before every log_meal or edit_meal call, first call check_quantity_plausible with the resolved " +
      "food id — if it says implausible, call request_confirmation, then ask the user to confirm the " +
      "quantity out loud, and only proceed after they confirm. " +
      "Before calling delete_meal, always call request_confirmation (passing the meal_id being deleted), " +
      "then ask the user to confirm which meal and get an explicit yes in the same conversation — never " +
      "delete on the first request. " +
      "Always call request_confirmation right before speaking either confirmation question, not after — " +
      "it signals to the app that you're waiting on the user. " +
      "Keep responses short and conversational, since this is a voice interface.",
    tools: {
      log_meal: logMealTool,
      edit_meal: editMealTool,
      delete_meal: deleteMealTool,
      find_recent_meals: findRecentMealsTool,
      check_quantity_plausible: checkQuantityTool,
      request_confirmation: requestConfirmationTool,
    },
  });
}
