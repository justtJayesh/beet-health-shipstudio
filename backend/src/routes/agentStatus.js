// backend/src/routes/agentStatus.js
import express from "express";
import { broadcast } from "../sse/broadcast.js";

const VALID_STATUSES = ["listening", "thinking", "speaking", "awaiting_confirmation"];

export function createAgentStatusRouter() {
  const router = express.Router();

  router.post("/", (req, res) => {
    const { status, targetMealId } = req.body ?? {};
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: "invalid_status", message: `status must be one of ${VALID_STATUSES.join(", ")}` });
    }

    const event = { type: "agent_status", status };
    if (targetMealId != null) {
      event.targetMealId = targetMealId;
    }
    broadcast(event);
    return res.status(204).end();
  });

  return router;
}
