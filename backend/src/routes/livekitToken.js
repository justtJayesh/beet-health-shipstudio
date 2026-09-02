// backend/src/routes/livekitToken.js
import express from "express";
import { AccessToken } from "livekit-server-sdk";
import { DEFAULT_USER_ID } from "../constants.js";

// Single fixed user/room — matches DEFAULT_USER_ID's single-user premise.
// Two tabs open at once would collide in this room; acceptable at this scope.
export const VOICE_ROOM_NAME = "beet-voice-session";

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

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: DEFAULT_USER_ID,
    });
    at.addGrant({ room: VOICE_ROOM_NAME, roomJoin: true, canPublish: true, canSubscribe: true });
    const token = await at.toJwt();

    return res.json({ token, url: LIVEKIT_URL, roomName: VOICE_ROOM_NAME });
  });

  return router;
}
