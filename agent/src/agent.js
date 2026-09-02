// agent/src/agent.js
import { Agent, tool } from "@livekit/agents";
import { z } from "zod";
import { isImplausible, findFoodByPhrase } from "./quantityGuard.js";

function foodNamesList(foodsById) {
  return Array.from(foodsById.values())
    .map((food) => [food.name, ...(food.aliases ?? [])].join("/"))
    .join(", ");
}

// buildAgent returns { agent, confirmationState } — confirmationState is the
// single shared mutable object main.js reads to decide whether to report
// "awaiting_confirmation" instead of the SDK's native state. See Fix 1 in
// the final review: request_confirmation used to post agent_status itself,
// racing with main.js's own AgentStateChanged-driven posts and losing.
export function buildAgent({ backendClient, foodsById }) {
  const confirmationState = { pendingTargetMealId: undefined, pending: false };

  function clearPendingConfirmation() {
    confirmationState.pending = false;
    confirmationState.pendingTargetMealId = undefined;
  }

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
      clearPendingConfirmation();
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
      clearPendingConfirmation();
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
      clearPendingConfirmation();
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
      "Before calling log_meal or edit_meal, call this with the spoken food phrase, quantity, and unit " +
      "to check whether the quantity looks like a misheard/implausible amount that needs the user's " +
      "confirmation before logging. If it returns implausible=true, ask the user to confirm the amount " +
      "out loud before calling log_meal/edit_meal. If it returns implausible=null, the food phrase " +
      "wasn't recognized by this check — proceed to log_meal/edit_meal anyway, since that call's own " +
      "food resolution will handle an unrecognized food correctly.",
    parameters: z.object({
      food: z.string().describe("The food name or alias as the user said it, e.g. \"roti\""),
      quantity: z.number(),
      unit: z.string(),
    }),
    execute: async ({ food, quantity, unit }) => {
      const resolved = findFoodByPhrase(food, foodsById);
      if (!resolved) {
        return { implausible: null, reason: "unrecognized_food" };
      }
      try {
        const implausible = isImplausible({ foodId: resolved.id, quantity, unit, foodsById });
        return { implausible };
      } catch (err) {
        return { implausible: null, reason: err.message };
      }
    },
  });

  const cancelConfirmationTool = tool({
    description:
      "Call this the moment the user declines or cancels a pending delete/quantity confirmation " +
      "(e.g. says 'no', 'never mind', 'don't delete that') instead of confirming it. This tells the " +
      "app the confirmation is no longer pending.",
    parameters: z.object({}),
    execute: async () => {
      clearPendingConfirmation();
      return { ok: true };
    },
  });

  const requestConfirmationTool = tool({
    description:
      "Call this immediately before speaking a delete confirmation question or a quantity confirmation question — right before you ask the user to confirm, not after. " +
      "This lets the app show the user that you're waiting for their confirmation. " +
      "The app itself reports the awaiting_confirmation status to the backend; you don't need to do anything else.",
    parameters: z.object({
      target_meal_id: z.string().optional().describe("The meal_id being confirmed for deletion, if applicable. Omit for a new/not-yet-logged meal's quantity confirmation."),
    }),
    execute: async ({ target_meal_id }) => {
      confirmationState.pending = true;
      confirmationState.pendingTargetMealId = target_meal_id;
      return { ok: true };
    },
  });

  const agent = new Agent({
    instructions:
      "You are Beet, a voice assistant that logs meals for one user. You can ONLY log foods from " +
      `this closed list (name/aliases per food): ${foodNamesList(foodsById)}. This list is a reference ` +
      "for recognizing what the user means — never reject a food yourself just because the user's exact " +
      "words don't literally match an entry; always attempt to log it and let the tool decide. " +
      "For each distinct food item the user mentions, call log_meal once, passing the food phrase " +
      "as the user said it. If log_meal's result has an error field: \"no_match\" means the food genuinely " +
      "isn't in the list — tell the user that plainly; \"ambiguous\" means multiple foods could match — " +
      "read out the candidates and ask which one they meant, then call log_meal again with their answer; " +
      "\"invalid_unit\" means the unit doesn't apply to that food — ask for a valid unit and retry. " +
      "Never guess or log something close to what the user said instead of what the tool actually resolved. " +
      "Before every log_meal or edit_meal call, first call check_quantity_plausible with the spoken " +
      "food phrase — if it says implausible, call request_confirmation, then ask the user to confirm the " +
      "quantity out loud, and only proceed after they confirm. If it says implausible is null, proceed " +
      "to log_meal/edit_meal anyway. " +
      "Before calling delete_meal, always call request_confirmation (passing the meal_id being deleted), " +
      "then ask the user to confirm which meal and get an explicit yes in the same conversation — never " +
      "delete on the first request. " +
      "Always call request_confirmation right before speaking either confirmation question, not after — " +
      "it signals to the app that you're waiting on the user. " +
      "If the user declines or cancels a pending confirmation instead of confirming it, call " +
      "cancel_confirmation right away so the app knows it's no longer waiting. " +
      "If a tool call fails or times out, tell the user something like \"I couldn't save that, please " +
      "try again in a second\" rather than proceeding as if it succeeded. " +
      "Keep responses short and conversational, since this is a voice interface.",
    tools: {
      log_meal: logMealTool,
      edit_meal: editMealTool,
      delete_meal: deleteMealTool,
      find_recent_meals: findRecentMealsTool,
      check_quantity_plausible: checkQuantityTool,
      request_confirmation: requestConfirmationTool,
      cancel_confirmation: cancelConfirmationTool,
    },
  });

  return { agent, confirmationState };
}
