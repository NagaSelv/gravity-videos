import crypto from "node:crypto";

const COOKIE = "tlp_session";
const THIRTY_DAYS = 30 * 24 * 60 * 60;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
}

function sign(value) {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function makeToken(payload) {
  const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${p}.${sign(p)}`;
}

export function readToken(token) {
  if (!token || typeof token !== "string") return null;
  const [p, s] = token.split(".");
  if (!p || !s || !safeEqual(s, sign(p))) return null;
  try {
    const obj = JSON.parse(Buffer.from(p, "base64url").toString());
    if (obj.exp && Date.now() > obj.exp) return null;
    return obj;
  } catch {
    return null;
  }
}

export function getCookie(req, name) {
  const header = req.headers.get("cookie") || "";
  for (const part of header.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}

export function isAuthed(req) {
  try {
    const t = readToken(getCookie(req, COOKIE));
    return Boolean(t && t.sub === "owner");
  } catch {
    return false;
  }
}

export function passwordMatches(input) {
  const pw = process.env.APP_PASSWORD;
  if (!pw || !input) return false;
  return safeEqual(input, pw);
}

export function loginCookie() {
  const tok = makeToken({ sub: "owner", exp: Date.now() + THIRTY_DAYS * 1000 });
  return `${COOKIE}=${tok}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${THIRTY_DAYS}`;
}

export function logoutCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}

export function requireAuth(req) {
  return isAuthed(req) ? null : json({ error: "not_logged_in" }, 401);
}

export function missingConfig() {
  return ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "APP_PASSWORD", "SESSION_SECRET", "POSTER_API_KEY"].filter(
    (k) => !process.env[k]
  );
}

/** True when the request carries the poster API key (used by the GitHub Action). */
export function hasApiKey(req) {
  const key = process.env.POSTER_API_KEY;
  const auth = req.headers.get("authorization") || "";
  if (!key || !auth.startsWith("Bearer ")) return false;
  return safeEqual(auth.slice(7), key);
}

export function requireOwnerOrKey(req) {
  return isAuthed(req) || hasApiKey(req) ? null : json({ error: "unauthorised" }, 401);
}
