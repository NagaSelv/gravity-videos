// Backstop for GitHub's unreliable cron: every 15 minutes, make sure the "Post queued videos"
// workflow has run recently, and start it if not. Instagram Reels and YouTube upload-limit
// retries only happen on those runs, so a stalled GitHub schedule would otherwise hold them up.
//
// Needs GITHUB_DISPATCH_TOKEN: a fine-grained personal access token for NagaSelv/gravity-videos
// with "Actions: Read and write" (nothing else).

const REPO = "NagaSelv/gravity-videos";
const WORKFLOW = "post.yml";
const RECENT_MS = 10 * 60 * 1000; // a run started in the last 10 minutes counts as "ran"

const gh = (token, path, init = {}) =>
  fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "tired-linguist-poster-tick",
      ...(init.headers || {}),
    },
  });

export default async () => {
  const token = Netlify.env.get("GITHUB_DISPATCH_TOKEN");
  if (!token) {
    console.log("poster-tick: GITHUB_DISPATCH_TOKEN is not set; nothing to do");
    return;
  }

  const res = await gh(token, `/actions/workflows/${WORKFLOW}/runs?per_page=5`);
  if (!res.ok) {
    console.log(`poster-tick: could not list runs (${res.status}): ${await res.text()}`);
    return;
  }
  const { workflow_runs: runs = [] } = await res.json();
  const now = Date.now();
  const busy = runs.find((r) => r.status === "queued" || r.status === "in_progress");
  const recent = runs.find((r) => now - new Date(r.created_at).getTime() < RECENT_MS);
  if (busy || recent) {
    const r = busy || recent;
    console.log(`poster-tick: run ${r.id} (${r.event}, ${r.status}) at ${r.created_at}; not starting another`);
    return;
  }

  const last = runs[0];
  const d = await gh(token, `/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ref: "main", inputs: { dry_run: false } }),
  });
  if (d.status === 204) {
    console.log(`poster-tick: started the poster (last run: ${last ? `${last.event} at ${last.created_at}` : "none"})`);
  } else {
    console.log(`poster-tick: dispatch failed (${d.status}): ${await d.text()}`);
  }
};

// :01, :16, :31, :46 past each hour (UTC; same minutes in Singapore, UTC+8), so posts due on
// the quarter hour (00:15, 08:15, 16:15 Singapore) go out a minute or two later.
export const config = {
  schedule: "1,16,31,46 * * * *",
};
