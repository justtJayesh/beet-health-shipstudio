import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Meal } from "../../src/models/Meal.js";

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}, 30000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await Meal.deleteMany({});
});

describe("Meal schema", () => {
  const validMeal = () => ({
    userId: "default-user",
    foodId: "roti",
    name: "Roti",
    quantity: 2,
    unit: "piece",
    grams: 80,
    macros: { calories: 238, protein: 9, carbs: 46.4, fat: 3 },
    mealType: "breakfast",
    loggedAt: new Date(),
  });

  it("saves a valid meal and stamps createdAt/updatedAt", async () => {
    const meal = await Meal.create(validMeal());
    expect(meal.createdAt).toBeInstanceOf(Date);
    expect(meal.updatedAt).toBeInstanceOf(Date);
  });

  it("rejects a mealType outside the enum", async () => {
    await expect(Meal.create({ ...validMeal(), mealType: "brunch" })).rejects.toThrow();
  });

  it("rejects a negative quantity", async () => {
    await expect(Meal.create({ ...validMeal(), quantity: -1 })).rejects.toThrow();
  });

  it("allows two meals with no idempotencyKey (field is optional)", async () => {
    await Meal.create(validMeal());
    await expect(Meal.create(validMeal())).resolves.toBeDefined();
  });

  it("rejects two meals for the same user with the same idempotencyKey", async () => {
    await Meal.create({ ...validMeal(), idempotencyKey: "key-1" });
    await expect(
      Meal.create({ ...validMeal(), idempotencyKey: "key-1" })
    ).rejects.toThrow();
  });

  it("allows the same idempotencyKey for two different users", async () => {
    await Meal.create({ ...validMeal(), userId: "user-a", idempotencyKey: "key-1" });
    await expect(
      Meal.create({ ...validMeal(), userId: "user-b", idempotencyKey: "key-1" })
    ).resolves.toBeDefined();
  });
});
