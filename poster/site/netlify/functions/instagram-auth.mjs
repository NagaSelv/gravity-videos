import crypto from "node:crypto";
import { isAuthed, makeToken, readToken } from "../lib/session.mjs";
import { igConfigured, loginUrl, connectInstagram } from "../lib/instagram.mjs";

const back = (msg) =>
  new Response(null, { status: 302, headers: { location: `/app/?ig=${encodeURIComponent(msg)}` } });

export default async (req) => {
  const url = new URL(req.url);
  if (!isAuthed(req)) return back("login_first");
  if (!igConfigured()) return back("not_configured");

  if (url.pathname === "/auth/instagram/start") {
    const state = makeToken({ n: crypto.randomBytes(12).toString("hex"), exp: Date.now() + 10 * 60 * 1000 });
    return new Response(null, { status: 302, headers: { location: loginUrl(req, state) } });
  }

  if (url.searchParams.get("error")) {
    return back(`error:${url.searchParams.get("error_description") || url.searchParams.get("error")}`);
  }
  if (!readToken(url.searchParams.get("state"))) return back("bad_state");
  const code = url.searchParams.get("code");
  if (!code) return back("no_code");
  try {
    const accounts = await connectInstagram(code, req);
    return back(`connected:${accounts.map((a) => a.handle).join(", ")}`);
  } catch (e) {
    return back(`error:${e.message}`);
  }
};

export const config = { path: ["/auth/instagram/start", "/auth/instagram/callback"] };
