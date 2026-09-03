// backend/test/routes/livekitToken.test.js
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createApp } from "../../src/server.js";
import { VOICE_ROOM_PREFIX } from "../../src/routes/livekitToken.js";

// Reads the `video.room` grant straight out of the signed JWT payload, so the
// tests below check what LiveKit will actually honor rather than just the
// convenience `roomName` field echoed alongside it.
function grantedRoom(token) {
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  return payload.video.room;
}

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
  it("returns a token, url, and a prefixed room name when LiveKit env vars are set", async () => {
    process.env.LIVEKIT_URL = "wss://example.livekit.cloud";
    process.env.LIVEKIT_API_KEY = "test-key";
    process.env.LIVEKIT_API_SECRET = "test-secret";

    const { status, body } = await requestToken();

    expect(status).toBe(200);
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThan(0);
    expect(body.url).toBe("wss://example.livekit.cloud");
    expect(body.roomName.startsWith(`${VOICE_ROOM_PREFIX}-`)).toBe(true);
    expect(grantedRoom(body.token)).toBe(body.roomName);
  });

  // Regression: a fixed room name meant only the first join ever created the
  // room, and LiveKit dispatches an agent on room CREATION. Every later click
  // rejoined the still-alive room, no agent was dispatched, and the client hung
  // on "Connecting…" forever. Each token must name a room that does not exist
  // yet, so the join creates it and dispatch fires.
  it("issues a distinct room per request so agent dispatch fires on every connect", async () => {
    process.env.LIVEKIT_URL = "wss://example.livekit.cloud";
    process.env.LIVEKIT_API_KEY = "test-key";
    process.env.LIVEKIT_API_SECRET = "test-secret";

    const first = await requestToken();
    const second = await requestToken();
    const third = await requestToken();

    const rooms = [first, second, third].map((r) => r.body.roomName);
    expect(new Set(rooms).size).toBe(3);

    // The signed grant must track the unique name, not a shared constant.
    expect(grantedRoom(first.body.token)).toBe(rooms[0]);
    expect(grantedRoom(second.body.token)).toBe(rooms[1]);
    expect(grantedRoom(third.body.token)).toBe(rooms[2]);
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
