import { getStore } from "@netlify/blobs";

export const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

export function siteUrl(req) {
  return process.env.URL || new URL(req.url).origin;
}

export function redirectUri(req) {
  return `${siteUrl(req)}/auth/youtube/callback`;
}

export const channelsStore = () => getStore({ name: "yt-channels", consistency: "strong" });
export const postsStore = () => getStore({ name: "posts", consistency: "strong" });

export async function tokenRequest(params) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      ...params,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error_description || data.error || `token_error_${res.status}`);
    err.code = data.error;
    throw err;
  }
  return data;
}

/** Returns a fresh (1 hour) access token for a stored channel. */
export async function accessTokenFor(channelId) {
  const store = channelsStore();
  const ch = await store.get(channelId, { type: "json" });
  if (!ch) {
    const err = new Error("This channel isn't connected.");
    err.code = "unknown_channel";
    throw err;
  }
  try {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: ch.refreshToken });
    if (ch.needsReconnect) await store.setJSON(channelId, { ...ch, needsReconnect: false });
    return t.access_token;
  } catch (e) {
    if (e.code === "invalid_grant") {
      await store.setJSON(channelId, { ...ch, needsReconnect: true });
      e.message = "Google sign-in for this channel has expired or was revoked. Reconnect it.";
    }
    throw e;
  }
}

export async function youtubeGet(path, accessToken) {
  const res = await fetch(`https://www.googleapis.com/youtube/v3/${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `youtube_error_${res.status}`);
  return data;
}
