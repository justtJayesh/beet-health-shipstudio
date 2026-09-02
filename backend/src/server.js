// backend/src/server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import { createFoodsRouter } from "./routes/foods.js";
import { createMealsRouter } from "./routes/meals.js";
import { createAgentStatusRouter } from "./routes/agentStatus.js";
import { registerClient } from "./sse/broadcast.js";
import { buildFoodsIndex } from "./services/foodsResolver.js";
import { connectDB } from "./db.js";

// Builds the Express app without connecting to Mongo or listening — lets
// tests get a fresh app per file with an injected foods index.
export function createApp({ index = buildFoodsIndex() } = {}) {
  const app = express();
  app.use(cors({ origin: process.env.CORS_ORIGIN ?? "http://localhost:5173" }));
  app.use(express.json());

  app.get("/api/events", (req, res) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();
    registerClient(res);
  });

  app.use("/api/foods", createFoodsRouter({ index }));
  app.use("/api/meals", createMealsRouter({ index }));
  app.use("/api/agent-status", createAgentStatusRouter());

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);

    const status = err.status ?? err.statusCode;
    if (status) {
      return res.status(status).json({ error: "bad_request", message: err.message });
    }
    if (err.name === "ValidationError") {
      return res.status(400).json({ error: "validation_error", message: err.message });
    }
    if (err.name === "CastError") {
      if (err.path === "_id") {
        return res.status(404).json({ error: "meal_not_found", message: err.message });
      }
      return res.status(400).json({ error: "cast_error", message: err.message });
    }

    res.status(500).json({ error: "internal_error" });
  });

  return app;
}

async function main() {
  const port = process.env.PORT ?? 3001;
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("MONGO_URI is not set — copy .env.example to .env first.");
    process.exit(1);
  }
  const app = createApp(); // triggers buildFoodsIndex() — fails fast on bad foods.json before touching Mongo
  await connectDB(mongoUri);
  app.listen(port, () => {
    console.log(`backend listening on :${port}`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
