// Tired Linguist Poster: uploads queued posts in posts/*.json to YouTube.
// Runs in GitHub Actions (.github/workflows/post.yml). No dependencies: Node 20+.
//
// Env: POSTER_URL (Netlify site), POSTER_API_KEY, GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_SHA
// Optional: DRY_RUN=1 (validate posts, upload nothing)

import fs from "node:fs";
import path from "node:path";

const POSTS_DIR = "posts";
const MAX_ATTEMPTS = 3;
const STALE_DAYS = 3; // never post something that was due more than this long ago
const SCHEDULE_MARGIN_MS = 10 * 60 * 1000; // closer than this to now => publish immediately

const { POSTER_URL, POSTER_API_KEY, GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_SHA, DRY_RUN } = process.env;

const log = (...a) => console.log(...a);
const now = () => new Date();

async function poster(pathname, init = {}) {
  const res = await fetch(`${POSTER_URL}${pathname}`, {
    ...init,
    headers: { authorization: `Bearer ${POSTER_API_KEY}`, "content-type": "application/json", ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${pathname}: ${data.message || data.error || res.status}`);
  return data;
}

let channelCache;
async function resolveChannel(ref) {
  channelCache ??= (await poster("/api/channels")).channels;
  const r = String(ref).trim().toLowerCase();
  const ch = channelCache.find(
    (c) => c.id.toLowerCase() === r || (c.handle || "").toLowerCase() === r || c.title.toLowerCase() === r
  );
  if (!ch) {
    const names = channelCache.map((c) => `${c.title} (${c.handle || c.id})`).join(", ") || "none";
    throw new Error(`Channel "${ref}" is not connected. Connected: ${names}`);
  }
  return ch;
}

async function loadVideo(post) {
  if (post.videoUrl) {
    const res = await fetch(post.videoUrl);
    if (!res.ok) throw new Error(`Could not download ${post.videoUrl}: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  if (!post.video) throw new Error('Post needs "video" (repo path) or "videoUrl"');
  if (fs.existsSync(post.video)) return fs.readFileSync(post.video);
  // Sparse checkout: fetch the file from the repo through the API.
  const url = `https://api.github.com/repos/${GITHUB_REPOSITORY}/contents/${post.video}?ref=${GITHUB_SHA}`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${GITHUB_TOKEN}`, accept: "application/vnd.github.raw" },
  });
  if (!res.ok) throw new Error(`Could not fetch ${post.video} from the repo: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function youtubeStatus(target, publishAt) {
  const privacy = target.privacy || "public";
  const status = { selfDeclaredMadeForKids: Boolean(target.madeForKids) };
  const due = publishAt ? new Date(publishAt) : null;
  if (privacy === "public" && due && due - now() > SCHEDULE_MARGIN_MS) {
    status.privacyStatus = "private";
    status.publishAt = due.toISOString();
  } else {
    status.privacyStatus = privacy;
  }
  return status;
}

async function uploadToYouTube(target, publishAt, video) {
  const ch = await resolveChannel(target.channel);
  const { accessToken } = await poster("/api/youtube/token", {
    method: "POST",
    body: JSON.stringify({ channelId: ch.id }),
  });

  const metadata = {
    snippet: {
      title: target.title,
      description: target.description || "",
      tags: target.tags || [],
      categoryId: String(target.categoryId || "20"),
    },
    status: youtubeStatus(target, publishAt),
  };

  const init = await fetch(
    `https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status&notifySubscribers=${target.notifySubscribers === false ? "false" : "true"}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json; charset=UTF-8",
        "x-upload-content-length": String(video.length),
        "x-upload-content-type": "video/mp4",
      },
      body: JSON.stringify(metadata),
    }
  );
  if (!init.ok) {
    const err = await init.json().catch(() => ({}));
    throw new Error(`YouTube refused the upload: ${err?.error?.message || init.status}`);
  }
  const uploadUrl = init.headers.get("location");

  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": "video/mp4", "content-length": String(video.length) },
    body: video,
  });
  const result = await put.json().catch(() => ({}));
  if (!put.ok) throw new Error(`YouTube upload failed: ${result?.error?.message || put.status}`);

  return {
    status: metadata.status.publishAt ? "scheduled" : metadata.status.privacyStatus === "public" ? "published" : "uploaded",
    channel: ch.title,
    videoId: result.id,
    url: `https://youtube.com/shorts/${result.id}`,
    publishAt: metadata.status.publishAt || null,
    privacy: metadata.status.privacyStatus,
    uploadedAt: now().toISOString(),
  };
}

function validate(post, file) {
  const errs = [];
  const targets = [].concat(post.youtube || []);
  if (!targets.length) errs.push('no "youtube" target');
  if (post.publishAt && isNaN(new Date(post.publishAt))) errs.push("publishAt is not a valid date");
  for (const t of targets) {
    if (!t.channel) errs.push("youtube target needs channel");
    if (!t.title) errs.push("youtube target needs title");
    if ((t.title || "").length > 100) errs.push("youtube title is over 100 characters");
    if (/[<>]/.test(t.title || "")) errs.push("youtube title can't contain < or >");
    if ((t.description || "").length > 5000) errs.push("youtube description is over 5000 characters");
  }
  if (errs.length) throw new Error(`${file}: ${errs.join("; ")}`);
}

async function main() {
  if (!fs.existsSync(POSTS_DIR)) return log("No posts folder.");
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".json")).sort();
  let failures = 0;
  let changed = [];

  for (const f of files) {
    const file = path.join(POSTS_DIR, f);
    let post;
    try {
      post = JSON.parse(fs.readFileSync(file, "utf8"));
      validate(post, file);
    } catch (e) {
      log(`✗ ${e.message}`);
      failures++;
      continue;
    }
    post.results ??= {};
    let video = null;
    let dirty = false;

    for (const target of [].concat(post.youtube)) {
      const key = `youtube:${target.channel}`;
      const prev = post.results[key];
      if (prev && ["scheduled", "published", "uploaded", "skipped"].includes(prev.status)) continue;
      if (prev?.status === "failed" && prev.attempts >= MAX_ATTEMPTS) continue;

      const due = post.publishAt ? new Date(post.publishAt) : null;
      if (due && now() - due > STALE_DAYS * 864e5) {
        post.results[key] = { status: "skipped", reason: `due more than ${STALE_DAYS} days ago` };
        dirty = true;
        log(`- ${f} → ${target.channel}: skipped (stale)`);
        continue;
      }

      if (DRY_RUN) {
        log(`~ ${f} → ${target.channel}: would upload (${JSON.stringify(youtubeStatus(target, post.publishAt))})`);
        continue;
      }

      try {
        video ??= await loadVideo(post);
        log(`↑ ${f} → ${target.channel}: uploading ${(video.length / 1e6).toFixed(1)} MB`);
        post.results[key] = await uploadToYouTube(target, post.publishAt, video);
        log(`✓ ${f} → ${post.results[key].channel}: ${post.results[key].status} ${post.results[key].url}`);
      } catch (e) {
        const attempts = (prev?.attempts || 0) + 1;
        post.results[key] = { status: "failed", error: e.message, attempts, lastTry: now().toISOString() };
        log(`✗ ${f} → ${target.channel}: ${e.message} (attempt ${attempts}/${MAX_ATTEMPTS})`);
        failures++;
      }
      dirty = true;
    }

    if (dirty) {
      fs.writeFileSync(file, JSON.stringify(post, null, 2) + "\n");
      changed.push(file);
    }
  }

  fs.writeFileSync(".poster-changed", changed.join("\n"));
  log(`Done. ${changed.length} post file(s) updated, ${failures} failure(s).`);
  if (failures) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
