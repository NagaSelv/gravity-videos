// Instagram API with Unified Login (Facebook Login for Business + configuration).
// The login returns a Business Integration System User token that never expires.
import { getStore } from "@netlify/blobs";

export const FB_GRAPH = "https://graph.facebook.com/v25.0";

export const igStore = () => getStore({ name: "ig-accounts", consistency: "strong" });

export function igRedirectUri(req) {
  return `${process.env.URL || new URL(req.url).origin}/auth/instagram/callback`;
}

export function igConfigured() {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.INSTAGRAM_CONFIG_ID);
}

async function fbJson(res, what) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const err = new Error(data.error?.message || `${what} failed (${res.status})`);
    err.code = data.error?.code;
    throw err;
  }
  return data;
}

export function loginUrl(req, state) {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID,
    config_id: process.env.INSTAGRAM_CONFIG_ID,
    redirect_uri: igRedirectUri(req),
    response_type: "code",
    override_default_response_type: "true",
    state,
  });
  return `https://www.facebook.com/v25.0/dialog/oauth?${params}`;
}

/** code → system-user token → the Instagram accounts it was granted. Stores one record per account. */
export async function connectInstagram(code, req) {
  const tok = await fbJson(
    await fetch(
      `${FB_GRAPH}/oauth/access_token?${new URLSearchParams({
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        redirect_uri: igRedirectUri(req),
        code,
      })}`
    ),
    "Code exchange"
  );
  const token = tok.access_token;

  // Which Instagram accounts did the login share? /me is the system user; its assigned accounts are listed here.
  const found = new Map();
  let next = `${FB_GRAPH}/me/assigned_instagram_accounts?${new URLSearchParams({ fields: "id,username", limit: "50", access_token: token })}`;
  let listError = null;
  while (next) {
    try {
      const page = await fbJson(await fetch(next), "Listing Instagram accounts");
      for (const a of page.data || []) if (a.id && a.username) found.set(String(a.id), a.username);
      next = page.paging?.next || null;
    } catch (e) {
      listError = e.message;
      next = null;
    }
  }
  if (!found.size) {
    throw new Error(`No Instagram account was shared${listError ? ` (${listError})` : ""}. Connect again and tick your Instagram account(s).`);
  }

  const store = igStore();
  const saved = [];
  for (const [id, username] of found) {
    const pic = await fetch(`${FB_GRAPH}/${id}?${new URLSearchParams({ fields: "profile_picture_url", access_token: token })}`)
      .then((r) => r.json())
      .then((d) => d.profile_picture_url || null)
      .catch(() => null);
    const account = {
      id,
      username,
      handle: `@${username}`,
      picture: pic,
      accessToken: token,
      tokenType: "system-user",
      tokenExpiresAt: null, // system-user tokens from Unified Login don't expire
      connectedAt: new Date().toISOString(),
      needsReconnect: false,
    };
    await store.setJSON(account.id, account);
    saved.push(account);
  }
  return saved;
}

export async function igTokenFor(accountId) {
  const store = igStore();
  const acc = await store.get(accountId, { type: "json" });
  if (!acc) {
    const err = new Error("This Instagram account isn't connected.");
    err.code = "unknown_account";
    throw err;
  }
  if (acc.tokenExpiresAt && Date.now() > acc.tokenExpiresAt) {
    await store.setJSON(accountId, { ...acc, needsReconnect: true });
    throw Object.assign(new Error("Instagram access expired. Reconnect the account."), { code: "expired" });
  }
  return acc;
}
