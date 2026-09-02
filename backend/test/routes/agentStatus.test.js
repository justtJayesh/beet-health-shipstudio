// backend/test/routes/agentStatus.test.js
import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../../src/server.js";
import { registerClient, _resetForTests } from "../../src/sse/broadcast.js";
import { EventEmitter } from "node:events";

function makeFakeResponse() {
  const res = new EventEmitter();
  res.written = [];
  res.write = (chunk) => res.written.push(chunk);
  return res;
}

let server;
let baseUrl;

beforeEach(async () => {
  _resetForTests();
  const app = createApp();
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

async function postStatus(body) {
  const res = await fetch(`${baseUrl}/api/agent-status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}

describe("POST /api/agent-status", () => {
  it("broadcasts a valid status to every SSE client and returns 204", async () => {
    const fakeRes = makeFakeResponse();
    registerClient(fakeRes);

    const { status } = await postStatus({ status: "thinking" });

    expect(status).toBe(204);
    expect(fakeRes.written).toHaveLength(1);
    expect(fakeRes.written[0]).toBe('data: {"type":"agent_status","status":"thinking"}\n\n');
  });

  it("includes targetMealId when present", async () => {
    const fakeRes = makeFakeResponse();
    registerClient(fakeRes);

    await postStatus({ status: "awaiting_confirmation", targetMealId: "abc123" });

    expect(fakeRes.written[0]).toBe(
      'data: {"type":"agent_status","status":"awaiting_confirmation","targetMealId":"abc123"}\n\n'
    );
  });

  it("rejects an invalid status with 400", async () => {
    const { status, body } = await postStatus({ status: "sleeping" });
    expect(status).toBe(400);
    expect(body.error).toBe("invalid_status");
  });

  it("rejects a missing status with 400", async () => {
    const { status, body } = await postStatus({});
    expect(status).toBe(400);
    expect(body.error).toBe("invalid_status");
  });
});
