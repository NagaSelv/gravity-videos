// Tired Linguist Poster: publishes queued posts in posts/*.json to YouTube and Instagram.
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
const IG_EARLY_MS = 3 * 60 * 1000; // Instagram has no scheduling: publish once due (minus this)
const IG_API = "https://graph.instagram.com/v25.0";
const UPLOAD_CAP = /exceeded the number of videos/i; // YouTube per-channel daily cap: wait, don't count
const WAIT_RETRY_MS = 2 * 60 * 60 * 1000; // retry capped channels every 2 hours

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

async function loadFile(repoPath, url, what) {
  if (url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not download ${url}: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  if (!repoPath) throw new Error(`Post needs a ${what} path or URL`);
  if (fs.existsSync(repoPath)) return fs.readFileSync(repoPath);
  // Sparse checkout: fetch the file from the repo through the API.
  const api = `https://api.github.com/repos/${GITHUB_REPOSITORY}/contents/${repoPath}?ref=${GITHUB_SHA}`;
  const res = await fetch(api, {
    headers: { authorization: `Bearer ${GITHUB_TOKEN}`, accept: "application/vnd.github.raw" },
  });
  if (!res.ok) throw new Error(`Could not fetch ${repoPath} from the repo: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const loadVideo = (post) => {
  if (!post.video && !post.videoUrl) throw new Error('Post needs "video" (repo path) or "videoUrl"');
  return loadFile(post.video, post.videoUrl, "video");
};
const hasThumbnail = (post) => Boolean(post.thumbnail || post.thumbnailUrl);
const loadThumbnail = (post) => loadFile(post.thumbnail, post.thumbnailUrl, "thumbnail");

async function accessTokenFor(channelRef) {
  const ch = await resolveChannel(channelRef);
  const { accessToken } = await poster("/api/youtube/token", {
    method: "POST",
    body: JSON.stringify({ channelId: ch.id }),
  });
  return { ch, accessToken };
}

// Custom thumbnail (needs the channel's intermediate features, i.e. a verified phone number).
async function setThumbnail(target, videoId, image) {
  if (image.length > 2 * 1024 * 1024) throw new Error("thumbnail is over YouTube's 2 MB limit");
  const { accessToken } = await accessTokenFor(target.channel);
  const type = image.subarray(0, 4).toString("hex") === "89504e47" ? "image/png" : "image/jpeg";
  const res = await fetch(
    `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`,
    { method: "POST", headers: { authorization: `Bearer ${accessToken}`, "content-type": type }, body: image }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`YouTube refused the thumbnail: ${err?.error?.message || res.status}`);
  }
}

function youtubeStatus(target, publishAt) {
  const privacy = target.privacy || "public";
  const status = { selfDeclaredMadeForKids: Boolean(target.madeForKids) };
  // YouTube's "altered or synthetic content" label (e.g. a synthetic narration voice)
  if (target.isAiGenerated !== undefined) status.containsSyntheticMedia = Boolean(target.isAiGenerated);
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
  const { ch, accessToken } = await accessTokenFor(target.channel);

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

let igCache;
async function resolveIgAccount(ref) {
  igCache ??= (await poster("/api/instagram/accounts")).accounts;
  const r = String(ref).trim().toLowerCase().replace(/^@/, "");
  const acc = igCache.find((a) => a.id === r || a.username.toLowerCase() === r);
  if (!acc) {
    const names = igCache.map((a) => a.handle).join(", ") || "none";
    throw new Error(`Instagram account "${ref}" is not connected. Connected: ${names}`);
  }
  return acc;
}

function igVideoUrls(post) {
  if (post.videoUrl) return [post.videoUrl];
  const repoPath = post.video.split("/").map(encodeURIComponent).join("/");
  return [
    `https://cdn.jsdelivr.net/gh/${GITHUB_REPOSITORY}@${GITHUB_SHA}/${repoPath}`, // served as video/mp4
    `https://raw.githubusercontent.com/${GITHUB_REPOSITORY}/${GITHUB_SHA}/${repoPath}`,
  ];
}

async function ig(pathname, params, token, method = "GET") {
  const qs = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`${IG_API}${pathname}${method === "GET" ? `?${qs}` : ""}`, {
    method,
    ...(method === "POST" ? { headers: { "content-type": "application/x-www-form-urlencoded" }, body: qs } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`Instagram ${pathname}: ${data.error?.message || res.status}`);
  return data;
}

async function publishToInstagram(target, post) {
  const acc = await resolveIgAccount(target.account);
  const { accessToken } = await poster("/api/instagram/token", {
    method: "POST",
    body: JSON.stringify({ accountId: acc.id }),
  });
  let lastErr;
  for (const videoUrl of igVideoUrls(post)) {
    const params = { media_type: "REELS", video_url: videoUrl, share_to_feed: String(target.shareToFeed !== false) };
    if (target.caption) params.caption = target.caption;
    if (target.thumbOffset != null) params.thumb_offset = String(target.thumbOffset);
    if (target.coverUrl) params.cover_url = target.coverUrl;
    const { id: container } = await ig(`/${acc.id}/media`, params, accessToken, "POST");

    // Instagram fetches and processes the video; wait for it (up to 10 minutes).
    let status = "IN_PROGRESS", detail = "";
    for (let i = 0; i < 60 && status === "IN_PROGRESS"; i++) {
      await new Promise((r) => setTimeout(r, 10000));
      const c = await ig(`/${container}`, { fields: "status_code,status" }, accessToken);
      status = c.status_code;
      detail = c.status || "";
    }
    if (status === "FINISHED") {
      const { id: mediaId } = await ig(`/${acc.id}/media_publish`, { creation_id: container }, accessToken, "POST");
      const media = await ig(`/${mediaId}`, { fields: "permalink" }, accessToken).catch(() => ({}));
      return {
        status: "published",
        channel: acc.handle,
        mediaId,
        url: media.permalink || null,
        publishedAt: now().toISOString(),
      };
    }
    lastErr = new Error(`Instagram couldn't process the video (${status}${detail ? `: ${detail}` : ""}) from ${new URL(videoUrl).host}`);
    log(`  ${lastErr.message}; trying next source`);
  }
  throw lastErr;
}

function validate(post, file) {
  const errs = [];
  const targets = [].concat(post.youtube || []);
  const igTargets = [].concat(post.instagram || []);
  if (!targets.length && !igTargets.length) errs.push('no "youtube" or "instagram" target');
  for (const t of igTargets) {
    if (!t.account) errs.push("instagram target needs account");
    if ((t.caption || "").length > 2200) errs.push("instagram caption is over 2200 characters");
    if (((t.caption || "").match(/#\w/g) || []).length > 30) errs.push("instagram caption has more than 30 hashtags");
  }
  if (igTargets.length && !post.video && !post.videoUrl) errs.push("instagram needs video or videoUrl");
  if (post.publishAt && isNaN(new Date(post.publishAt))) errs.push("publishAt is not a valid date");
  if (post.thumbnail && !/\.(png|jpe?g)$/i.test(post.thumbnail)) errs.push("thumbnail must be a .png or .jpg");
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
    let thumb = null;
    let dirty = false;

    const applyThumbnail = async (target, res) => {
      if (!hasThumbnail(post) || !res?.videoId || res.thumbnail === "set") return false;
      if ((res.thumbnailAttempts || 0) >= MAX_ATTEMPTS) return false;
      if (DRY_RUN) {
        log(`~ ${f} → ${target.channel}: would set thumbnail`);
        return false;
      }
      try {
        thumb ??= await loadThumbnail(post);
        await setThumbnail(target, res.videoId, thumb);
        res.thumbnail = "set";
        delete res.thumbnailError;
        log(`✓ ${f} → ${target.channel}: thumbnail set`);
      } catch (e) {
        res.thumbnailAttempts = (res.thumbnailAttempts || 0) + 1;
        res.thumbnail = "failed";
        res.thumbnailError = e.message;
        log(`✗ ${f} → ${target.channel}: ${e.message} (thumbnail attempt ${res.thumbnailAttempts}/${MAX_ATTEMPTS})`);
        failures++;
      }
      return true;
    };

    for (const target of [].concat(post.youtube || [])) {
      const key = `youtube:${target.channel}`;
      const prev = post.results[key];
      if (prev && ["scheduled", "published", "uploaded"].includes(prev.status)) {
        // Video is up; add the thumbnail if one is listed and not set yet.
        if (await applyThumbnail(target, prev)) dirty = true;
        continue;
      }
      if (prev?.status === "skipped") continue;
      if (prev?.status === "failed" && prev.attempts >= MAX_ATTEMPTS) continue;
      if (prev?.status === "waiting" && now() - new Date(prev.lastTry) < WAIT_RETRY_MS) continue;

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
        await applyThumbnail(target, post.results[key]);
      } catch (e) {
        if (UPLOAD_CAP.test(e.message)) {
          // Channel hit YouTube's daily upload cap: keep waiting, retry on later runs.
          post.results[key] = { status: "waiting", reason: "channel daily upload limit; retrying", error: e.message, lastTry: now().toISOString() };
          log(`… ${f} → ${target.channel}: daily upload limit reached, will retry later`);
        } else {
          const attempts = (prev?.attempts || 0) + 1;
          post.results[key] = { status: "failed", error: e.message, attempts, lastTry: now().toISOString() };
          log(`✗ ${f} → ${target.channel}: ${e.message} (attempt ${attempts}/${MAX_ATTEMPTS})`);
          failures++;
        }
      }
      dirty = true;
    }

    for (const target of [].concat(post.instagram || [])) {
      const key = `instagram:${target.account}`;
      const prev = post.results[key];
      if (prev && ["published", "skipped"].includes(prev.status)) continue;
      if (prev?.status === "failed" && prev.attempts >= MAX_ATTEMPTS) continue;

      const due = post.publishAt ? new Date(post.publishAt) : null;
      if (due && now() - due > STALE_DAYS * 864e5) {
        post.results[key] = { status: "skipped", reason: `due more than ${STALE_DAYS} days ago` };
        dirty = true;
        log(`- ${f} → Instagram ${target.account}: skipped (stale)`);
        continue;
      }
      if (due && due - now() > IG_EARLY_MS) {
        log(`… ${f} → Instagram ${target.account}: waiting until ${due.toISOString()}`);
        continue;
      }
      if (DRY_RUN) {
        log(`~ ${f} → Instagram ${target.account}: would publish from ${igVideoUrls(post)[0]}`);
        continue;
      }
      try {
        log(`↑ ${f} → Instagram ${target.account}: publishing`);
        post.results[key] = await publishToInstagram(target, post);
        log(`✓ ${f} → Instagram ${post.results[key].channel}: published ${post.results[key].url || post.results[key].mediaId}`);
      } catch (e) {
        const attempts = (prev?.attempts || 0) + 1;
        post.results[key] = { status: "failed", error: e.message, attempts, lastTry: now().toISOString() };
        log(`✗ ${f} → Instagram ${target.account}: ${e.message} (attempt ${attempts}/${MAX_ATTEMPTS})`);
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
