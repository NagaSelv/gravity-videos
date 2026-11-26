# Post queue

One JSON file per post. Pushing a file here runs the **Post queued videos** Action,
which uploads the video to YouTube and schedules it. Results are written back into the file.

```json
{
  "video": "videos/2026-11-27-hsc.mp4",
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
- `publishAt`: when it goes public. Leave it out, or give a time in the past, to publish straight away.
  Further ahead than 10 minutes, the video is uploaded now as private and YouTube publishes it at that time.
- `youtube.channel`: the channel's @handle, its title, or its UC… ID, as connected at
  https://tired-linguist-poster.netlify.app/app/. `youtube` can also be a list, for several channels.
- `privacy`: `public` (default), `unlisted` or `private`.
- Results appear under `"results"`: `scheduled` / `published` with the video URL, or `failed` with the error.
  Failed uploads are retried hourly, up to 3 attempts. Posts due more than 3 days ago are skipped.
