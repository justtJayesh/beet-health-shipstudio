import { describe, it, expect, afterEach } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { connectDB, disconnectDB } from "../src/db.js";

describe("connectDB", () => {
  afterEach(async () => {
    await disconnectDB();
  });

  it("connects mongoose to the given URI", async () => {
    const mongod = await MongoMemoryServer.create();
    const connection = await connectDB(mongod.getUri());
    expect(connection.readyState).toBe(1); // 1 = connected
    await mongod.stop();
  });
});
