// backend/test/routes/livekitToken.test.js
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createApp } from "../../src/server.js";
import { VOICE_ROOM_NAME } from "../../src/routes/livekitToken.js";

let server;
let baseUrl;
let originalEnv;

beforeEach(async () => {
  originalEnv = { ...process.env };
  const app = createApp();
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(() => {
  process.env = originalEnv;
  server.close();
});

async function requestToken() {
  const res = await fetch(`${baseUrl}/api/livekit-token`, { method: "POST" });
  return { status: res.status, body: await res.json() };
}

describe("POST /api/livekit-token", () => {
  it("returns a token, url, and fixed room name when LiveKit env vars are set", async () => {
    process.env.LIVEKIT_URL = "wss://example.livekit.cloud";
    process.env.LIVEKIT_API_KEY = "test-key";
    process.env.LIVEKIT_API_SECRET = "test-secret";

    const { status, body } = await requestToken();

    expect(status).toBe(200);
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThan(0);
    expect(body.url).toBe("wss://example.livekit.cloud");
    expect(body.roomName).toBe(VOICE_ROOM_NAME);
  });

  it("fails clearly with 500 when LiveKit env vars are missing", async () => {
    delete process.env.LIVEKIT_URL;
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;

    const { status, body } = await requestToken();

    expect(status).toBe(500);
    expect(body.error).toBe("livekit_not_configured");
  });
});
