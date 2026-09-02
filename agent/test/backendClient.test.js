// agent/test/backendClient.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createBackendClient } from "../src/backendClient.js";

function jsonResponse(status, body) {
  return { status, json: () => Promise.resolve(body) };
}

describe("createBackendClient", () => {
  let fetchMock;
  let client;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    client = createBackendClient({ baseUrl: "http://test-backend" });
  });

  it("logMeal POSTs to /api/meals with a generated UUID idempotencyKey", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { meal: { _id: "m1" } }));

    const result = await client.logMeal({ food: "roti", quantity: 2, unit: "piece" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://test-backend/api/meals");
    expect(options.method).toBe("POST");
    const sentBody = JSON.parse(options.body);
    expect(sentBody.food).toBe("roti");
    expect(sentBody.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(result).toEqual({ status: 201, body: { meal: { _id: "m1" } } });
  });

  it("logMeal passes through a deduped response distinctly from a fresh one", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { meal: { _id: "m1" }, deduped: true }));
    const result = await client.logMeal({ food: "roti", quantity: 2, unit: "piece" });
    expect(result.status).toBe(200);
    expect(result.body.deduped).toBe(true);
  });

  it("logMeal passes through a 422 ambiguous outcome without throwing", async () => {
    fetchMock.mockResolvedValue(jsonResponse(422, { error: "ambiguous", candidates: [{ id: "dal_tadka" }] }));
    const result = await client.logMeal({ food: "dal", quantity: 1, unit: "katori" });
    expect(result.status).toBe(422);
    expect(result.body.error).toBe("ambiguous");
  });

  it("editMeal PATCHes /api/meals/:id with a generated idempotencyKey", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { meal: { _id: "m1", quantity: 3 } }));
    const result = await client.editMeal("m1", { quantity: 3 });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://test-backend/api/meals/m1");
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body).idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.body.meal.quantity).toBe(3);
  });

  it("deleteMeal DELETEs /api/meals/:id", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { meal: { _id: "m1" } }));
    const result = await client.deleteMeal("m1");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://test-backend/api/meals/m1");
    expect(options.method).toBe("DELETE");
    expect(result.status).toBe(200);
  });

  it("deleteMeal passes through a 404 without throwing", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: "meal_not_found" }));
    const result = await client.deleteMeal("missing");
    expect(result.status).toBe(404);
  });

  it("listMeals GETs /api/meals with an hours query param when given", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { meals: [] }));
    await client.listMeals({ hours: 24 });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("http://test-backend/api/meals?hours=24");
  });

  it("listMeals GETs /api/meals with no query param when hours is omitted", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { meals: [] }));
    await client.listMeals();
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("http://test-backend/api/meals");
  });

  it("postAgentStatus POSTs to /api/agent-status and resolves without a body", async () => {
    fetchMock.mockResolvedValue({ status: 204 });
    await client.postAgentStatus({ status: "thinking" });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://test-backend/api/agent-status");
    expect(JSON.parse(options.body)).toEqual({ status: "thinking" });
  });

  it("postAgentStatus includes targetMealId when given", async () => {
    fetchMock.mockResolvedValue({ status: 204 });
    await client.postAgentStatus({ status: "awaiting_confirmation", targetMealId: "m1" });
    const [, options] = fetchMock.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ status: "awaiting_confirmation", targetMealId: "m1" });
  });

  it("logMeal passes an AbortSignal so a hung backend can't hang the call forever", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { meal: { _id: "m1" } }));
    await client.logMeal({ food: "roti", quantity: 2, unit: "piece" });
    const [, options] = fetchMock.mock.calls[0];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("logMeal generates a different idempotencyKey on each call", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { meal: { _id: "m1" } }));
    await client.logMeal({ food: "roti", quantity: 2, unit: "piece" });
    await client.logMeal({ food: "roti", quantity: 2, unit: "piece" });
    const key1 = JSON.parse(fetchMock.mock.calls[0][1].body).idempotencyKey;
    const key2 = JSON.parse(fetchMock.mock.calls[1][1].body).idempotencyKey;
    expect(key1).not.toBe(key2);
  });
});
