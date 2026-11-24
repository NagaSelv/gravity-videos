# Daily High Score Challenge video pipeline

Input: the developer's phone screen recording (1080 x 2400, with game music + sound effects).
Output: 1080 x 1920 video, ~80 s: opening card (3 s) -> captioned try (board scaled 712 x 1480 at 184,420; caption box at y=170) -> results held 4 s -> closing card ("We know you can do better", "...and so much more", "Free on Google Play").

Steps (scripts expect to run from a work folder; paths inside are absolute to the original session and need adjusting):
1. `cards.py "DD MON YYYY"` makes bg/open/close cards (Bungee font, icon cropped from assets/title-frame.png at 390,520-690,820). The closing card and bg2 layout in the session were made by a variant: title band "HIGH SCORE CHALLENGE" 54px at y=40 + date 36px at y=112; closing card text as in the 24 Nov video.
2. Write caps.json: list of {s, e, text}; text lines split by "|", *word* = gold. First person, the founder's thinking and reactions to each drop. Use only what's on screen (words formed, scores, "Best possible drop", streak, combos).
3. `captions.py caps.json` renders cap_NN.png (Poppins Bold).
4. `compose.py out.mp4` builds the video. Recording crop: 1080x2245 from y=100 (removes the status bar and gesture bar). The recording's own audio is the soundtrack; assets/music-tail.m4a (game music, from the trailer at 20-27 s) covers the closing card.
5. Commit to videos/YYYY-MM-DD-hsc.mp4, then schedule via Buffer from
   https://raw.githubusercontent.com/NagaSelv/gravity-videos/main/videos/YYYY-MM-DD-hsc.mp4
