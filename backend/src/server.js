// backend/src/server.js
import "dotenv/config";
import express from "express";
import { createFoodsRouter } from "./routes/foods.js";
import { createMealsRouter } from "./routes/meals.js";
import { registerClient } from "./sse/broadcast.js";
import { buildFoodsIndex } from "./services/foodsResolver.js";
import { connectDB } from "./db.js";

// Builds the Express app without connecting to Mongo or listening — lets
// tests get a fresh app per file with an injected foods index.
export function createApp({ index = buildFoodsIndex() } = {}) {
  const app = express();
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

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
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
  await connectDB(mongoUri);
  const app = createApp();
  app.listen(port, () => {
    console.log(`backend listening on :${port}`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
