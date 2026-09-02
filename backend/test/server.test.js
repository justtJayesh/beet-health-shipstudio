// backend/test/server.test.js
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createApp } from "../src/server.js";
import { buildFoodsIndex } from "../src/services/foodsResolver.js";

const sampleFoods = [
  {
    id: "roti",
    name: "Roti",
    aliases: ["chapati"],
    macrosPer100g: { calories: 297, protein: 11.2, carbs: 58.0, fat: 3.7 },
    units: [{ name: "piece", grams: 40 }],
  },
];

let mongod;
let server;
let baseUrl;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const app = createApp({ index: buildFoodsIndex(sampleFoods) });
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}, 30000);

afterAll(async () => {
  server.close();
  await mongoose.disconnect();
  await mongod.stop();
});

describe("CORS", () => {
  it("sets Access-Control-Allow-Origin on API responses", async () => {
    const res = await fetch(`${baseUrl}/api/meals`, {
      headers: { Origin: "http://localhost:5173" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeTruthy();
  });

  it("does not allow a different origin", async () => {
    const res = await fetch(`${baseUrl}/api/meals`, {
      headers: { Origin: "http://evil.example" },
    });
    expect(res.headers.get("access-control-allow-origin")).not.toBe("http://evil.example");
  });
});
