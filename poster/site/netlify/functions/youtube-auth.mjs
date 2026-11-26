import crypto from "node:crypto";
import { isAuthed, makeToken, readToken } from "../lib/session.mjs";
import { SCOPES, redirectUri, tokenRequest, youtubeGet, channelsStore } from "../lib/google.mjs";

const back = (msg) =>
  new Response(null, { status: 302, headers: { location: `/app/?yt=${encodeURIComponent(msg)}` } });

export default async (req) => {
  const url = new URL(req.url);
  if (!isAuthed(req)) return back("login_first");

  if (url.pathname === "/auth/youtube/start") {
    const state = makeToken({ n: crypto.randomBytes(12).toString("hex"), exp: Date.now() + 10 * 60 * 1000 });
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri(req),
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent select_account",
      include_granted_scopes: "true",
      state,
    });
    return new Response(null, {
      status: 302,
      headers: { location: `https://accounts.google.com/o/oauth2/v2/auth?${params}` },
    });
  }

  // Callback
  if (url.searchParams.get("error")) return back(`google_${url.searchParams.get("error")}`);
  if (!readToken(url.searchParams.get("state"))) return back("bad_state");
  const code = url.searchParams.get("code");
  if (!code) return back("no_code");

  try {
    const tokens = await tokenRequest({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(req),
    });
    if (!tokens.refresh_token) return back("no_refresh_token");
    const data = await youtubeGet("channels?part=snippet&mine=true", tokens.access_token);
    const ch = data.items?.[0];
    if (!ch) return back("no_channel_on_account");
    await channelsStore().setJSON(ch.id, {
      id: ch.id,
      title: ch.snippet.title,
      handle: ch.snippet.customUrl || null,
      thumbnail: ch.snippet.thumbnails?.default?.url || null,
      refreshToken: tokens.refresh_token,
      connectedAt: new Date().toISOString(),
      needsReconnect: false,
    });
    return back(`connected:${ch.snippet.title}`);
  } catch (e) {
    return back(`error:${e.message}`);
  }
};

export const config = { path: ["/auth/youtube/start", "/auth/youtube/callback"] };
