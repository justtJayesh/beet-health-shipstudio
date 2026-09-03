// backend/src/routes/livekitToken.js
import { randomUUID } from "node:crypto";
import express from "express";
import { AccessToken } from "livekit-server-sdk";
import { DEFAULT_USER_ID } from "../constants.js";

// A fresh room name per session, NOT one fixed name.
//
// LiveKit fires automatic agent dispatch when a room is CREATED, not when a
// participant joins. With a single fixed room name, only the very first join
// ever dispatched an agent: the room then lingered server-side (empty rooms
// survive for emptyTimeout), so every later click joined the still-existing
// room, no dispatch fired, no agent ever arrived, and the client sat on
// "Connecting…" forever with no error.
//
// A unique name per token guarantees the join creates the room, which
// guarantees dispatch. It also removes the two-tabs-collide case the fixed
// name had.
export const VOICE_ROOM_PREFIX = "beet-voice-session";

export function createLivekitTokenRouter() {
  const router = express.Router();

  router.post("/", async (req, res) => {
    const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
    if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      return res.status(500).json({
        error: "livekit_not_configured",
        message: "LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET must be set",
      });
    }

    const roomName = `${VOICE_ROOM_PREFIX}-${randomUUID()}`;

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: DEFAULT_USER_ID,
    });
    at.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true });
    const token = await at.toJwt();

    return res.json({ token, url: LIVEKIT_URL, roomName });
  });

  return router;
}
