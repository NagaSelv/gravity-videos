"""Tired Linguist · Limina daily video builder (Day 2, Limina #33).

Layout matches Day 1: cream header band (day label, two-line caption, "order so far" strip),
gameplay below (raw recording cropped 1:1), opening card with logo (= thumbnail),
linguist's notes, Day 1 end card, channel music.
"""
import json, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1920
CREAM = (250, 245, 233)
NAVY = (19, 32, 60)
GREY = (72, 80, 107)
STRIP = (230, 235, 243)
TILE_NAVY = (27, 33, 50)
HEADER_H = 520
RAW_Y = 270                      # recording crop top (just under the browser bar)
FR = '/home/claude/tl/fonts/Fraunces.ttf'
INTER = '/usr/share/fonts/opentype/inter/Inter-Regular.otf'
OUT = '/home/claude/day02/build'
RAW = '/home/claude/day02/raw.mp4'
TILEFRAME = '/home/claude/day02/r530.png'
ENDCARD = '/home/claude/dl/end.png'
MUSIC_SRC = '/home/claude/dl/day01_krillion.mp4'
DAY, GAME = 2, 'limina'
os.makedirs(OUT, exist_ok=True)


def fraunces(size, wght=600, opsz=24):
    f = ImageFont.truetype(FR, size)
    f.set_variation_by_axes([opsz, wght, 0, 0])
    return f


def inter(size):
    return ImageFont.truetype(INTER, size)


# ---------- tiles & diagrams ----------
src = Image.open(TILEFRAME).convert('RGB')
TY0, TY1 = 2128, 2227
TILES = {k: src.crop((x0, TY0, x0 + 99, TY1)) for k, x0 in
         {'A': 67, 'M': 244, 'S': 420, 'E': 596}.items()}
ARROW = src.crop((166, TY0, 245, TY1))        # straight arrow, tile height


def recolour_bg(im, bg):
    """Swap the game's page background (~231,236,242) for our strip colour."""
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b = px[x, y]
            if abs(r - 231) < 6 and abs(g - 236) < 6 and abs(b - 242) < 6:
                px[x, y] = bg
    return im


TILES = {k: recolour_bg(v.copy(), STRIP) for k, v in TILES.items()}
ARROW = recolour_bg(ARROW.copy(), STRIP)


def linear(letters):
    w = len(letters) * 99 + (len(letters) - 1) * 79
    im = Image.new('RGB', (w, 99), STRIP)
    x = 0
    for i, L in enumerate(letters):
        im.paste(TILES[L], (x, 0)); x += 99
        if i < len(letters) - 1:
            im.paste(ARROW, (x, 0)); x += 79
    return im


def curve(d, p0, p3, width=5):
    (x0, y0), (x3, y3) = p0, p3
    mx = (x0 + x3) / 2
    pts = []
    for i in range(41):
        t = i / 40
        x = (1-t)**3*x0 + 3*(1-t)**2*t*mx + 3*(1-t)*t**2*mx + t**3*x3
        y = (1-t)**3*y0 + 3*(1-t)**2*t*y0 + 3*(1-t)*t**2*y3 + t**3*y3
        pts.append((x, y))
    d.line(pts[:-4], fill=TILE_NAVY, width=width, joint='curve')
    ax, ay = pts[-1]; bx, by = pts[-5]
    import math
    ang = math.atan2(ay - by, ax - bx)
    s = 18
    d.polygon([(ax, ay),
               (ax - s*math.cos(ang) + s*0.55*math.sin(ang), ay - s*math.sin(ang) - s*0.55*math.cos(ang)),
               (ax - s*math.cos(ang) - s*0.55*math.sin(ang), ay - s*math.sin(ang) + s*0.55*math.cos(ang))],
              fill=TILE_NAVY)


def branched(nodes, edges, scale=0.72):
    """nodes: {letter: (col, row)}, rows 0/1 (0.5 = middle)."""
    t = int(99 * scale); gapx = int(79 * scale * 1.25); gapy = 16
    cols = max(c for c, r in nodes.values()) + 1
    w = cols * t + (cols - 1) * gapx
    h = 2 * t + gapy
    im = Image.new('RGB', (w, h), STRIP)
    d = ImageDraw.Draw(im)
    pos = {}
    for L, (c, r) in nodes.items():
        x = c * (t + gapx); y = int(r * (t + gapy))
        im.paste(TILES[L].resize((t, t), Image.LANCZOS), (x, y)); pos[L] = (x, y)
    for a, b in edges:
        (xa, ya), (xb, yb) = pos[a], pos[b]
        p0 = (xa + t - 2, ya + t / 2); p3 = (xb - 3, yb + t / 2)
        if abs(p0[1] - p3[1]) < 2:
            d.line([p0, (p3[0] - 16, p3[1])], fill=TILE_NAVY, width=5)
            d.polygon([(p3[0], p3[1]), (p3[0] - 18, p3[1] - 10), (p3[0] - 18, p3[1] + 10)], fill=TILE_NAVY)
        else:
            curve(d, p0, p3)
    return im


STATES = {
    'S0': None,
    'S1': linear('AS'),
    'S2': branched({'A': (0, 0.5), 'E': (1, 0), 'S': (1, 1)}, [('A', 'E'), ('A', 'S')]),
    'S3': branched({'A': (0, 0.5), 'E': (1, 0), 'M': (1, 1), 'S': (2, 1)},
                   [('A', 'E'), ('A', 'M'), ('M', 'S')]),
    'S4': linear('AMSE'),
}


# ---------- header band ----------
def header(caption, state, path):
    im = Image.new('RGB', (W, HEADER_H), CREAM)
    d = ImageDraw.Draw(im)
    d.text((66, 41), f'day {DAY} · {GAME}', font=inter(35), fill=GREY)
    f = fraunces(62)
    lines = caption.split('|') if caption else []
    for i, line in enumerate(lines[:2]):
        d.text((66, 93 + 73 * i), line, font=f, fill=NAVY)
    d.text((66, 262), 'order so far', font=inter(30), fill=GREY)
    box_y0, box_h = 302, 200
    dia = STATES[state]
    if dia is None:
        txt = 'no order found yet.'
        tw = d.textlength(txt, font=inter(30))
        d.rounded_rectangle((44, box_y0, 44 + tw + 80, box_y0 + 110), 26, fill=STRIP)
        d.text((84, box_y0 + 36), txt, font=inter(30), fill=GREY)
    else:
        bw = dia.width + 100
        d.rounded_rectangle((44, box_y0, 44 + bw, box_y0 + box_h), 28, fill=STRIP)
        im.paste(dia, (94, box_y0 + (box_h - dia.height) // 2))
    im.save(path)


# ---------- full-screen cards ----------
def opening_card(path, aside):
    im = Image.new('RGB', (W, H), CREAM)
    end = Image.open(ENDCARD).convert('RGB').crop((300, 520, 780, 1000))
    m = Image.new('L', end.size, 0); ImageDraw.Draw(m).ellipse((10, 10, 470, 470), fill=255)
    end = Image.composite(end, Image.new('RGB', end.size, CREAM), m).resize((330, 330), Image.LANCZOS)
    im.paste(end, ((W - 330) // 2, 430))
    d = ImageDraw.Draw(im)
    def centre(text, font, y, fill):
        b = d.textbbox((0, 0), text, font=font)
        d.text(((W - (b[2] - b[0])) / 2 - b[0], y - b[1]), text, font=font, fill=fill)
    # Day 1 metrics (+230 px for the logo): "day 1" top 642, "limina" top 808, aside 970/1032, pill 1190
    centre(f'day {DAY}', fraunces(148), 642 + 230, NAVY)
    centre(GAME, fraunces(83, 500), 808 + 230, GREY)
    for i, line in enumerate(aside):
        centre(line, inter(43), 970 + 230 + 62 * i, GREY)
    pf = ImageFont.truetype('/usr/share/fonts/opentype/inter/Inter-Medium.otf', 31); pt = 'spoiler warning · answer at the end'
    tw = d.textlength(pt, font=pf); px0 = (W - tw) / 2 - 40
    d.rounded_rectangle((px0, 1190 + 230, W - px0, 1270 + 230), 40, fill=NAVY)
    centre(pt, pf, 1190 + 230 + 24, (255, 255, 255))
    im.save(path)


def note_card(path, big, small):
    im = Image.new('RGB', (W, H), CREAM)
    d = ImageDraw.Draw(im)
    fb, fs = fraunces(66), inter(38)
    total = 60 + len(big) * 82 + 40 + len(small) * 54
    y = (H - total) // 2
    d.text((96, y), "linguist's note", font=inter(34), fill=GREY); y += 70
    for line in big:
        d.text((96, y), line, font=fb, fill=NAVY); y += 82
    y += 40
    for line in small:
        d.text((96, y), line, font=fs, fill=GREY); y += 54
    im.save(path)


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        print(' '.join(cmd)); print(r.stderr[-2000:]); sys.exit(1)


def main(spec_path, out_path):
    spec = json.load(open(spec_path))
    opening_card(f'{OUT}/open.png', spec['aside'])
    hdr = {}
    for i, p in enumerate(spec['pieces']):
        key = (p['cap'], p['diag'])
        if key not in hdr:
            hdr[key] = f'{OUT}/hdr{len(hdr):02d}.png'; header(p['cap'], p['diag'], hdr[key])
    clips = []
    # opening card
    clips.append((f'{OUT}/open.png', spec['open_s']))
    seg_files = []
    for i, p in enumerate(spec['pieces']):
        s, e = p['s'], p['e']
        dur_out = p.get('dur') or (e - s) / p.get('speed', 1)
        f = f'{OUT}/seg{i:02d}.mp4'
        speed = (e - s) / dur_out
        run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{s:.3f}', '-t', f'{e - s:.3f}', '-i', RAW,
             '-loop', '1', '-i', hdr[(p['cap'], p['diag'])],
             '-filter_complex',
             f"[0:v]setpts=(PTS-STARTPTS)/{speed:.5f},fps=30,crop=1080:{H - HEADER_H}:0:{RAW_Y}[g];"
             f"[1:v]fps=30,format=yuv420p[h];[h][g]vstack,trim=duration={dur_out:.3f},setsar=1,format=yuv420p[v]",
             '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-r', '30', f])
        seg_files.append(f)
    def still(img, dur, name):
        f = f'{OUT}/{name}.mp4'
        run(['ffmpeg', '-v', 'error', '-y', '-loop', '1', '-framerate', '30', '-t', f'{dur}', '-i', img,
             '-vf', 'scale=1080:1920,setsar=1,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast',
             '-crf', '18', '-r', '30', f])
        return f
    files = [still(f'{OUT}/open.png', spec['open_s'], 'c_open')] + seg_files
    for j, n in enumerate(spec['notes']):
        note_card(f'{OUT}/note{j}.png', n['big'], n['small'])
        files.append(still(f'{OUT}/note{j}.png', n['dur'], f'c_note{j}'))
    files.append(still(ENDCARD, spec['end_s'], 'c_end'))
    with open(f'{OUT}/list.txt', 'w') as fh:
        fh.writelines(f"file '{f}'\n" for f in files)
    run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', f'{OUT}/list.txt',
         '-c', 'copy', f'{OUT}/silent.mp4'])
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of',
                                'csv=p=0', f'{OUT}/silent.mp4'], capture_output=True, text=True).stdout)
    run(['ffmpeg', '-v', 'error', '-y', '-i', f'{OUT}/silent.mp4', '-stream_loop', '-1', '-i', MUSIC_SRC,
         '-filter_complex', f'[1:a]atrim=0:{dur:.3f},afade=t=out:st={dur - 2:.3f}:d=2,aresample=44100[a]',
         '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest',
         '-movflags', '+faststart', out_path])
    # thumbnail = opening card
    Image.open(f'{OUT}/open.png').save(out_path.replace('.mp4', '_thumb.png'))
    print('done', out_path, round(dur, 2), 's')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
