# Daily High Score Challenge video pipeline

```
pip install pillow --break-system-packages   # if missing; ffmpeg must be installed
python3 tools/make_video.py RECORDING.mp4 "25 NOV 2026" caps.json videos/2026-11-25-hsc.mp4 /tmp/work
```

- Input: the developer's phone recording of a High Score Challenge try (1080 x 2400, game music + sound effects).
- Output: 1080 x 1920, recording length + 8 s: opening card (first 3 s), captioned try, results held 4 s, closing card 4 s.
- caps.json: `[{"s": 3.0, "e": 7.6, "text": "Line one|Line with *gold* words"}]`, times in the recording's timeline.
  Example: tools/example-caps-2026-11-24.json.
- Assets: Bungee and Poppins Bold (OFL), the title frame (icon crop), music-tail.m4a (the game's own music, from the trailer).
- Publish from `https://raw.githubusercontent.com/NagaSelv/gravity-videos/main/videos/<file>`.
