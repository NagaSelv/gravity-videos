import { json, requireAuth, requireOwnerOrKey } from "../lib/session.mjs";
import { igStore, igTokenFor } from "../lib/instagram.mjs";

const publicView = ({ accessToken, ...rest }) => rest;

export default async (req) => {
  const { pathname, searchParams } = new URL(req.url);
  const store = igStore();

  // POST /api/instagram/token {accountId} → token for the GitHub Action
  if (pathname === "/api/instagram/token") {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const denied = requireOwnerOrKey(req);
    if (denied) return denied;
    const { accountId } = await req.json().catch(() => ({}));
    if (!accountId) return json({ error: "accountId required" }, 400);
    try {
      const acc = await igTokenFor(accountId);
      return json({ accessToken: acc.accessToken, igUserId: acc.id });
    } catch (e) {
      return json({ error: e.code || "token_error", message: e.message }, e.code === "unknown_account" ? 404 : 502);
    }
  }

  if (req.method === "GET") {
    const denied = requireOwnerOrKey(req);
    if (denied) return denied;
    const { blobs } = await store.list();
    const accounts = [];
    for (const b of blobs) {
      const a = await store.get(b.key, { type: "json" });
      if (a) accounts.push(publicView(a));
    }
    accounts.sort((a, b) => a.username.localeCompare(b.username));
    return json({ accounts });
  }

  if (req.method === "DELETE") {
    const denied = requireAuth(req);
    if (denied) return denied;
    const id = searchParams.get("id");
    if (!id || !(await store.get(id))) return json({ error: "not_found" }, 404);
    await store.delete(id);
    return json({ ok: true });
  }

  return json({ error: "method_not_allowed" }, 405);
};

export const config = { path: ["/api/instagram/accounts", "/api/instagram/token"] };
