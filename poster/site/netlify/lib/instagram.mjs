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

  // Which Instagram accounts did the login grant? debug_token lists them per permission.
  const dbg = await fbJson(
    await fetch(
      `${FB_GRAPH}/debug_token?${new URLSearchParams({
        input_token: token,
        access_token: `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`,
      })}`
    ),
    "Token check"
  );
  const scopes = dbg.data?.granular_scopes || [];
  const ids = new Set(
    scopes.filter((s) => /^instagram_(content_publish|basic)$/.test(s.scope)).flatMap((s) => s.target_ids || [])
  );
  if (!ids.size) throw new Error("No Instagram account was shared. Connect again and tick your Instagram account(s).");

  const store = igStore();
  const saved = [];
  for (const id of ids) {
    const me = await fbJson(
      await fetch(`${FB_GRAPH}/${id}?${new URLSearchParams({ fields: "username,profile_picture_url", access_token: token })}`),
      "Account lookup"
    ).catch(() => null);
    if (!me?.username) continue; // not an Instagram account
    const account = {
      id: String(id),
      username: me.username,
      handle: `@${me.username}`,
      picture: me.profile_picture_url || null,
      accessToken: token,
      tokenType: "system-user",
      tokenExpiresAt: dbg.data?.expires_at ? dbg.data.expires_at * 1000 : null, // null = never
      connectedAt: new Date().toISOString(),
      needsReconnect: false,
    };
    await store.setJSON(account.id, account);
    saved.push(account);
  }
  if (!saved.length) throw new Error("Couldn't read the shared Instagram account(s).");
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
