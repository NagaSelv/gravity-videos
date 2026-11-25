#!/usr/bin/env python3
"""Daily High Score Challenge video for Gravity! The Word Game.

Usage: python3 make_video.py RECORDING.mp4 "24 NOV 2026" caps.json OUT.mp4 [WORKDIR] [--music FILE] [--sfx]

--music FILE: replace the soundtrack with FILE (looped, faded), e.g. assets/gravity-arcade.m4a, our own
  composition (tools/compose_music.py). Without --sfx the recording's audio is dropped entirely (use this when
  the recording has the game's music in it: the Pixabay/Tunetank track gets YouTube Content ID claims).
--sfx: with --music, keep the recording's audio too (for recordings made with the game's music OFF, so only
  the sound effects remain), mixed over the new music.

caps.json: [{"s": 3.0, "e": 7.6, "text": "Line one|Line *gold* two"}, ...]
  s/e are seconds in the RECORDING's timeline (the opening card covers 0-3 s).
Layout: 1080x1920. Title band (y 40-150), caption box (y 170-400), board 712x1480 at (184,420).
The recording (1080x2400 phone capture) is cropped to 1080x2245 from y=100 (drops the status bar
and gesture bar). Its own audio (game music + sound effects) is the soundtrack; the results screen
is held 4 s after the recording ends, then the closing card plays for 4 s over assets/music-tail.m4a.
"""
import json, os, random, re, subprocess, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
A = lambda n: os.path.join(HERE, 'assets', n)
BUNGEE = A('Bungee-Regular.ttf')
POPPINS = A('Poppins-Bold.ttf')
GOLD = (253, 196, 69); BLUE = (200, 227, 251); WHITE = (255, 255, 255)
W, H = 1080, 1920

def dur(path):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                                          '-of', 'csv=p=0', path]).decode().strip())

def starfield(seed, n=260):
    im = Image.new('RGB', (W, H)); d = ImageDraw.Draw(im)
    for y in range(H):
        t = y / (H - 1); d.line([(0, y), (W, y)], fill=(round(10 + 8 * t), round(10 + 12 * t), round(24 + 28 * t)))
    r = random.Random(seed)
    for _ in range(n):
        x, y = r.uniform(0, W), r.uniform(0, H); s = r.choice([.8, 1, 1, 1.3, 1.8, 2.3]); a = r.randint(110, 255)
        d.ellipse([x - s, y - s, x + s, y + s], fill=(a, a, min(255, a + 15)))
    return im

def text(d, cx, y, s, size, col, sh=5):
    f = ImageFont.truetype(BUNGEE, size); w = d.textlength(s, font=f)
    while w > W - 80:
        size -= 2; f = ImageFont.truetype(BUNGEE, size); w = d.textlength(s, font=f)
    d.text((cx - w / 2 + sh * .5, y + sh), s, font=f, fill=(3, 5, 15)); d.text((cx - w / 2, y), s, font=f, fill=col)

def put_icon(im, size, y):
    ic = Image.open(A('title-frame.png')).convert('RGB').crop((390, 520, 690, 820)).resize((size, size), Image.LANCZOS)
    m = Image.new('L', (size, size), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=size // 5, fill=255)
    im.paste(ic, ((W - size) // 2, y), m.filter(ImageFilter.GaussianBlur(1.2)))

def cards(date, wd):
    bg = Image.new('RGB', (W, H), (12, 11, 24)); d = ImageDraw.Draw(bg); r = random.Random(3)
    for _ in range(160):
        x, y = r.uniform(0, W), r.uniform(0, H); s = r.choice([.8, 1, 1.3, 1.8]); a = r.randint(90, 220)
        d.ellipse([x - s, y - s, x + s, y + s], fill=(a, a, min(255, a + 15)))
    text(d, W / 2, 40, 'HIGH SCORE CHALLENGE', 54, WHITE, 5); text(d, W / 2, 112, date, 36, GOLD, 4)
    bg.save(f'{wd}/bg.png')
    o = starfield(1); d = ImageDraw.Draw(o); put_icon(o, 260, 520)
    text(d, W / 2, 860, 'GRAVITY!', 120, WHITE, 8); text(d, W / 2, 1010, 'HIGH SCORE CHALLENGE', 58, GOLD, 5)
    text(d, W / 2, 1090, date, 46, BLUE, 4); text(d, W / 2, 1290, '10 BLOCKS. 3 TRIES.', 44, WHITE, 4)
    text(d, W / 2, 1350, 'WATCH MY BEST TRY', 44, WHITE, 4); o.save(f'{wd}/open.png')
    c = starfield(2); d = ImageDraw.Draw(c); put_icon(c, 220, 380)
    text(d, W / 2, 660, 'WE KNOW YOU', 78, WHITE, 6); text(d, W / 2, 755, 'CAN DO BETTER.', 78, GOLD, 6)
    text(d, W / 2, 940, 'A NEW HIGH SCORE CHALLENGE', 42, WHITE, 4); text(d, W / 2, 995, 'EVERY DAY...', 42, WHITE, 4)
    text(d, W / 2, 1090, '...AND SO MUCH MORE', 50, GOLD, 5)
    text(d, W / 2, 1170, 'ORBITLE · RISING FLOORS', 36, BLUE, 3); text(d, W / 2, 1220, 'RANKS · SPACE STYLES', 36, BLUE, 3)
    text(d, W / 2, 1370, 'GRAVITY! THE WORD GAME', 48, WHITE, 4); text(d, W / 2, 1440, 'FREE ON GOOGLE PLAY', 48, GOLD, 4)
    c.save(f'{wd}/close.png')

def captions(caps, wd):
    for i, c in enumerate(caps):
        lines = c['text'].split('|'); size = 48; font = ImageFont.truetype(POPPINS, size)
        im = Image.new('RGBA', (W, 230), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
        segs = lambda l: [(p.strip('*'), p.startswith('*')) for p in re.split(r'(\*[^*]+\*)', l) if p]
        widths = lambda: [sum(d.textlength(t, font=font) for t, _ in segs(l)) for l in lines]
        ws = widths()
        while max(ws) + 70 > 1040:
            size -= 2; font = ImageFont.truetype(POPPINS, size); ws = widths()
        bw, bh = max(ws) + 70, 64 * len(lines) + 40; x0, y0 = (W - bw) / 2, (230 - bh) / 2
        d.rounded_rectangle([x0, y0, x0 + bw, y0 + bh], radius=28, fill=(20, 22, 48, 225), outline=(90, 200, 230, 255), width=3)
        y = y0 + 20
        for l, w in zip(lines, ws):
            x = (W - w) / 2
            for t, g in segs(l):
                d.text((x, y), t, font=font, fill=GOLD if g else WHITE); x += d.textlength(t, font=font)
            y += 64
        im.save(f'{wd}/cap_{i:02d}.png')

def main():
    args = sys.argv[1:]; music = None; sfx = '--sfx' in args
    if '--sfx' in args: args.remove('--sfx')
    if '--music' in args:
        i = args.index('--music'); music = args[i + 1]; del args[i:i + 2]
    rec, date, capsf, out = args[:4]
    wd = args[4] if len(args) > 4 else os.path.dirname(os.path.abspath(out))
    os.makedirs(wd, exist_ok=True)
    caps = json.load(open(capsf)); D = dur(rec)
    hold, endc = 4.0, 4.0
    T = round(D + hold + endc, 2); close_at = round(D + hold, 2); tail_at = max(0, D - 1.2)
    cards(date, wd); captions(caps, wd)
    inp = ['-loop', '1', '-framerate', '30', '-i', f'{wd}/bg.png', '-i', rec,
           '-loop', '1', '-framerate', '30', '-i', f'{wd}/open.png', '-loop', '1', '-framerate', '30', '-i', f'{wd}/close.png',
           ] + (['-stream_loop', '-1', '-i', music] if music else ['-i', A('music-tail.m4a')])
    for i in range(len(caps)):
        inp += ['-loop', '1', '-framerate', '30', '-t', str(T + 1), '-i', f'{wd}/cap_{i:02d}.png']
    f = [f"[1:v]fps=30,crop=1080:2245:0:100,scale=712:1480:flags=lanczos,setsar=1,tpad=stop_mode=clone:stop_duration={hold + endc + 1}[g]",
         f"[0:v][g]overlay=184:420,trim=0:{T}[b0]"]
    prev = 'b0'
    for i, c in enumerate(caps):
        s, e = c['s'], c['e']
        f.append(f"[{5 + i}:v]format=rgba,fade=t=in:st={s}:d=0.25:alpha=1,fade=t=out:st={e - 0.25}:d=0.25:alpha=1[c{i}]")
        f.append(f"[{prev}][c{i}]overlay=0:170:enable='between(t,{s},{e})'[b{i + 1}]"); prev = f'b{i + 1}'
    f += ["[2:v]format=rgba,fade=t=out:st=2.4:d=0.5:alpha=1,trim=0:3[o]",
          f"[{prev}][o]overlay=0:0:eof_action=pass[bo]",
          f"[3:v]format=rgba,fade=t=in:st=0:d=0.6:alpha=1,trim=0:{endc + 0.1},setpts=PTS+{close_at}/TB[cl]",
          f"[bo][cl]overlay=0:0:eof_action=pass,trim=0:{T},format=yuv420p[v]",
          ] + (([f"[4:a]aformat=sample_rates=44100:channel_layouts=stereo,atrim=0:{T},asetpts=PTS-STARTPTS,volume={0.55 if sfx else 1.0},afade=t=in:d=0.5,afade=t=out:st={T - 2.5}:d=2.5[m]"]
                + ([f"[1:a]aformat=sample_rates=44100:channel_layouts=stereo,afade=t=in:d=0.3,afade=t=out:st={tail_at}:d=1.2[s]",
                    f"[s][m]amix=inputs=2:duration=longest:normalize=0,atrim=0:{T}[a]"] if sfx else ["[m]anull[a]"]))
               if music else [
          f"[1:a]aformat=sample_rates=44100:channel_layouts=stereo,afade=t=in:d=0.3,afade=t=out:st={tail_at}:d=1.2[a1]",
          f"[4:a]aformat=sample_rates=44100:channel_layouts=stereo,atrim=0:{T - tail_at},asetpts=PTS-STARTPTS,afade=t=in:d=1.0,afade=t=out:st={max(0.5, T - tail_at - 2.0)}:d=2.0,adelay={int(tail_at * 1000)}|{int(tail_at * 1000)}[a2]",
          f"[a1][a2]amix=inputs=2:duration=longest:normalize=0,atrim=0:{T}[a]"])
    subprocess.run(['ffmpeg', '-v', 'error', '-y'] + inp + ['-filter_complex', ';'.join(f), '-map', '[v]', '-map', '[a]',
                    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-b:a', '160k',
                    '-movflags', '+faststart', out], check=True)
    print(out, T)

if __name__ == '__main__':
    main()
