# Daily High Score Challenge video pipeline

```
pip install pillow --break-system-packages   # if missing; ffmpeg must be installed
python3 tools/make_video.py RECORDING.mp4 "25 NOV 2026" caps.json videos/2026-11-25-hsc.mp4 /tmp/work
```

- Input: the developer's phone recording of a High Score Challenge try (1080 x 2400, game music + sound effects).
- Output: 1080 x 1920, recording length + 8 s: opening card (first 3 s), captioned try, results held 4 s, closing card 4 s.
- caps.json: `[{"s": 3.0, "e": 7.6, "text": "Line one|Line with *gold* words"}]`, times in the recording's timeline.
  Example: tools/example-caps-2026-11-24.json.
- **Music (from 25 Nov 2026):** the game's own track (Tunetank via Pixabay) gets YouTube Content ID claims
  (SourceAudio), so until the claim is released every video uses our own composition instead:
  `--music tools/assets/gravity-arcade.m4a` (made by `tools/compose_music.py`, 2:40, loops if needed).
  Recording with the game's music still in it: `--music …` alone (the recording's audio is dropped).
  Recording with music OFF, sound effects ON: `--music … --sfx` (sound effects mixed over the new music).
- Assets: Bungee and Poppins Bold (OFL), the title frame (icon crop), music-tail.m4a (the game's own music, from the trailer).
- Publish from `https://raw.githubusercontent.com/NagaSelv/gravity-videos/main/videos/<file>`.
