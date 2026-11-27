import crypto from "node:crypto";
import { isAuthed, makeToken, readToken } from "../lib/session.mjs";
import { IG_SCOPES, igRedirectUri, connectInstagram } from "../lib/instagram.mjs";

const back = (msg) =>
  new Response(null, { status: 302, headers: { location: `/app/?ig=${encodeURIComponent(msg)}` } });

export default async (req) => {
  const url = new URL(req.url);
  if (!isAuthed(req)) return back("login_first");
  if (!process.env.INSTAGRAM_APP_ID || !process.env.INSTAGRAM_APP_SECRET) return back("not_configured");

  if (url.pathname === "/auth/instagram/start") {
    const state = makeToken({ n: crypto.randomBytes(12).toString("hex"), exp: Date.now() + 10 * 60 * 1000 });
    const params = new URLSearchParams({
      client_id: process.env.INSTAGRAM_APP_ID,
      redirect_uri: igRedirectUri(req),
      response_type: "code",
      scope: IG_SCOPES.join(","),
      enable_fb_login: "0",
      force_authentication: "1",
      state,
    });
    return new Response(null, {
      status: 302,
      headers: { location: `https://www.instagram.com/oauth/authorize?${params}` },
    });
  }

  if (url.searchParams.get("error")) {
    return back(`error:${url.searchParams.get("error_description") || url.searchParams.get("error")}`);
  }
  if (!readToken(url.searchParams.get("state"))) return back("bad_state");
  const code = (url.searchParams.get("code") || "").replace(/#_$/, "");
  if (!code) return back("no_code");
  try {
    const acc = await connectInstagram(code, req);
    return back(`connected:${acc.handle}`);
  } catch (e) {
    return back(`error:${e.message}`);
  }
};

export const config = { path: ["/auth/instagram/start", "/auth/instagram/callback"] };
