import { json, requireAuth, requireOwnerOrKey } from "../lib/session.mjs";
import { channelsStore } from "../lib/google.mjs";

const publicView = ({ refreshToken, ...rest }) => rest;

export default async (req) => {
  const store = channelsStore();

  if (req.method === "GET") {
    const denied = requireOwnerOrKey(req);
    if (denied) return denied;
    const { blobs } = await store.list();
    const channels = [];
    for (const b of blobs) {
      const ch = await store.get(b.key, { type: "json" });
      if (ch) channels.push(publicView(ch));
    }
    channels.sort((a, b) => a.title.localeCompare(b.title));
    return json({ channels });
  }

  if (req.method === "DELETE") {
    const denied = requireAuth(req);
    if (denied) return denied;
    const id = new URL(req.url).searchParams.get("id");
    const ch = id && (await store.get(id, { type: "json" }));
    if (!ch) return json({ error: "not_found" }, 404);
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: ch.refreshToken }),
    }).catch(() => {});
    await store.delete(id);
    return json({ ok: true });
  }

  return json({ error: "method_not_allowed" }, 405);
};

export const config = { path: "/api/channels" };
