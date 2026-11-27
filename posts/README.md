# Post queue

One JSON file per post. Pushing a file here runs the **Post queued videos** Action,
which uploads the video to YouTube and schedules it. Results are written back into the file.

```json
{
  "video": "videos/2026-11-27-hsc.mp4",
  "thumbnail": "videos/2026-11-27-hsc_thumb.png",
  "publishAt": "2026-11-28T09:00:00+08:00",
  "youtube": {
    "channel": "@gravitywordgame",
    "title": "Can you beat 690? Gravity! High Score Challenge, 27 Nov",
    "description": "… #shorts",
    "tags": ["word game", "puzzle"],
    "categoryId": "20",
    "madeForKids": false,
    "privacy": "public"
  }
}
```

- `video`: path in this repo (or `videoUrl`: any public https URL).
- `thumbnail` (optional): path in this repo to a .png or .jpg under 2 MB (or `thumbnailUrl`). Set as the custom
  thumbnail right after the upload. Needs the channel's intermediate features (verified phone number).
  Adding it to a post that's already uploaded sets the thumbnail on the next run. Result under `"results"`:
  `"thumbnail": "set"`, or `"failed"` with `thumbnailError` (retried hourly, up to 3 attempts).
- `publishAt`: when it goes public. Leave it out, or give a time in the past, to publish straight away.
  Further ahead than 10 minutes, the video is uploaded now as private and YouTube publishes it at that time.
- `youtube.channel`: the channel's @handle, its title, or its UC… ID, as connected at
  https://tired-linguist-poster.netlify.app/app/. `youtube` can also be a list, for several channels.
- `privacy`: `public` (default), `unlisted` or `private`.
- `isAiGenerated`: set to `true` to label the video as altered or synthetic content on YouTube (e.g. a synthetic
  narration voice). Leave it out to send nothing.
- `notifySubscribers`: set to `false` to upload without notifying subscribers (default `true`).
- Results appear under `"results"`: `scheduled` / `published` with the video URL, or `failed` with the error.
  Failed uploads are retried hourly, up to 3 attempts. Posts due more than 3 days ago are skipped.

## Instagram

Add an `instagram` target (or a list of them) to post the same video as a Reel:

```json
"instagram": {
  "account": "@gravitywordgame",
  "caption": "Can you beat 690? … #wordgame #puzzle",
  "shareToFeed": true,
  "thumbOffset": 1500
}
```

- `account`: the @username, as connected at https://tired-linguist-poster.netlify.app/app/.
- `caption`: up to 2,200 characters and 30 hashtags.
- `thumbOffset` (optional): which frame to use as the cover, in milliseconds. Or `coverUrl`: a public image URL.
- Instagram's API can't schedule, so the Action checks every 15 minutes and publishes once `publishAt` is reached
  (GitHub can run it a few minutes late). With no `publishAt` it publishes on the next run.
- Instagram fetches the video from a public URL of the repo file, so the repo must stay public.

YouTube note: if a channel hits YouTube's daily upload limit, the post shows `waiting` and retries automatically.

