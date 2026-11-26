import { json, requireOwnerOrKey } from "../lib/session.mjs";
import { accessTokenFor } from "../lib/google.mjs";

// Hands out a short-lived (1 hour) YouTube access token for one connected channel.
// Used by the GitHub Action that uploads queued videos.
export default async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const denied = requireOwnerOrKey(req);
  if (denied) return denied;
  const { channelId } = await req.json().catch(() => ({}));
  if (!channelId) return json({ error: "channelId required" }, 400);
  try {
    const accessToken = await accessTokenFor(channelId);
    return json({ accessToken, expiresIn: 3600 });
  } catch (e) {
    return json({ error: e.code || "token_error", message: e.message }, e.code === "unknown_channel" ? 404 : 502);
  }
};

export const config = { path: "/api/youtube/token" };
