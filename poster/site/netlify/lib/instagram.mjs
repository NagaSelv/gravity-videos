import { getStore } from "@netlify/blobs";

export const IG_API = "https://graph.instagram.com/v25.0";
export const IG_SCOPES = ["instagram_business_basic", "instagram_business_content_publish"];
const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // long-lived tokens last 60 days; refresh weekly

export const igStore = () => getStore({ name: "ig-accounts", consistency: "strong" });

export function igRedirectUri(req) {
  return `${process.env.URL || new URL(req.url).origin}/auth/instagram/callback`;
}

async function igJson(res, what) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const msg = data.error?.message || data.error_message || data.error_description || `${what} failed (${res.status})`;
    const err = new Error(msg);
    err.code = data.error?.code || data.error_type || data.error;
    throw err;
  }
  return data;
}

/** code → short-lived token → long-lived (60-day) token + profile */
export async function connectInstagram(code, req) {
  const short = await igJson(
    await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.INSTAGRAM_APP_ID,
        client_secret: process.env.INSTAGRAM_APP_SECRET,
        grant_type: "authorization_code",
        redirect_uri: igRedirectUri(req),
        code,
      }),
    }),
    "Code exchange"
  );
  const shortToken = short.access_token || short.data?.[0]?.access_token;
  const long = await igJson(
    await fetch(
      `https://graph.instagram.com/access_token?${new URLSearchParams({
        grant_type: "ig_exchange_token",
        client_secret: process.env.INSTAGRAM_APP_SECRET,
        access_token: shortToken,
      })}`
    ),
    "Long-lived token exchange"
  );
  const me = await igJson(
    await fetch(
      `${IG_API}/me?${new URLSearchParams({
        fields: "user_id,username,profile_picture_url,account_type",
        access_token: long.access_token,
      })}`
    ),
    "Profile lookup"
  );
  const account = {
    id: String(me.user_id || me.id),
    username: me.username,
    handle: `@${me.username}`,
    accountType: me.account_type || null,
    picture: me.profile_picture_url || null,
    accessToken: long.access_token,
    tokenIssuedAt: Date.now(),
    tokenExpiresAt: Date.now() + (long.expires_in || 5184000) * 1000,
    connectedAt: new Date().toISOString(),
    needsReconnect: false,
  };
  await igStore().setJSON(account.id, account);
  return account;
}

/** Returns a valid token for an account, refreshing it when it is over a week old. */
export async function igTokenFor(accountId) {
  const store = igStore();
  const acc = await store.get(accountId, { type: "json" });
  if (!acc) {
    const err = new Error("This Instagram account isn't connected.");
    err.code = "unknown_account";
    throw err;
  }
  if (Date.now() > acc.tokenExpiresAt) {
    await store.setJSON(accountId, { ...acc, needsReconnect: true });
    throw Object.assign(new Error("Instagram sign-in expired. Reconnect the account."), { code: "expired" });
  }
  if (Date.now() - acc.tokenIssuedAt > REFRESH_AFTER_MS) {
    try {
      const r = await igJson(
        await fetch(
          `https://graph.instagram.com/refresh_access_token?${new URLSearchParams({
            grant_type: "ig_refresh_token",
            access_token: acc.accessToken,
          })}`
        ),
        "Token refresh"
      );
      const updated = {
        ...acc,
        accessToken: r.access_token,
        tokenIssuedAt: Date.now(),
        tokenExpiresAt: Date.now() + (r.expires_in || 5184000) * 1000,
        needsReconnect: false,
      };
      await store.setJSON(accountId, updated);
      return updated;
    } catch {
      return acc; // old token is still valid until it expires
    }
  }
  return acc;
}
