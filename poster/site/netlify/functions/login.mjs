import { json, passwordMatches, loginCookie, logoutCookie, isAuthed, missingConfig } from "../lib/session.mjs";

export default async (req) => {
  const { pathname } = new URL(req.url);
  if (pathname === "/api/me") {
    return json({ loggedIn: isAuthed(req), missingConfig: missingConfig() });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (pathname === "/api/logout") return json({ ok: true }, 200, { "set-cookie": logoutCookie() });

  const body = await req.json().catch(() => ({}));
  if (!passwordMatches(body.password)) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return json({ error: "wrong_password" }, 401);
  }
  return json({ ok: true }, 200, { "set-cookie": loginCookie() });
};

export const config = { path: ["/api/login", "/api/logout", "/api/me"] };
