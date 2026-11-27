"""Tired Linguist daily video builder for Gravity HSC, Orbitle and Wordle (Day 1 layouts).

python3 build_tl.py SPEC.json OUT.mp4
Spec: raw, day, label, layout ("scaled" = Gravity/Orbitle, recording at 0.72 centred;
"crop" = Wordle, recording 1:1 from the board down), card {name, sub, aside[], pill},
pieces [{s, e, speed|dur, cap}], notes [{dur, big[], small[]}], sfx (volume, 0 = none).
"""
import json, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

W, H, HDR = 1080, 1920, 260
CREAM, NAVY, GREY = (250, 245, 233), (19, 32, 60), (72, 80, 107)
FR = '/home/claude/tl/fonts/Fraunces.ttf'
INTER = '/usr/share/fonts/opentype/inter/Inter-Regular.otf'
INTER_M = '/usr/share/fonts/opentype/inter/Inter-Medium.otf'
ENDCARD = '/home/claude/dl/end.png'
MUSIC_SRC = '/home/claude/dl/day01_krillion.mp4'   # channel track, 61 s


def fr(size, wght=600, opsz=24):
    f = ImageFont.truetype(FR, size); f.set_variation_by_axes([opsz, wght, 0, 0]); return f


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        print(' '.join(map(str, cmd))); print(r.stderr[-2500:]); sys.exit(1)


def header(label, cap, path):
    im = Image.new('RGB', (W, HDR), CREAM); d = ImageDraw.Draw(im)
    d.text((66, 41), label, font=ImageFont.truetype(INTER, 35), fill=GREY)
    for i, line in enumerate((cap.split('|') if cap else [])[:2]):
        d.text((66, 93 + 73 * i), line, font=fr(62), fill=NAVY)
    im.save(path)


def logo():
    end = Image.open(ENDCARD).convert('RGB').crop((300, 520, 780, 1000))
    m = Image.new('L', end.size, 0); ImageDraw.Draw(m).ellipse((10, 10, 470, 470), fill=255)
    return Image.composite(end, Image.new('RGB', end.size, CREAM), m).resize((330, 330), Image.LANCZOS)


def opening_card(c, day, path):
    im = Image.new('RGB', (W, H), CREAM); im.paste(logo(), ((W - 330) // 2, 430)); d = ImageDraw.Draw(im)
    def centre(text, font, y, fill):
        b = d.textbbox((0, 0), text, font=font)
        d.text(((W - (b[2] - b[0])) / 2 - b[0], y - b[1]), text, font=font, fill=fill)
    o = 230  # logo offset; Day 1 positions (ink tops): day 622, name 788, sub 884, aside 1020, pill 1170
    centre(f'day {day}', fr(148), 622 + o, NAVY)
    centre(c['name'], fr(83, 500), 788 + o, GREY)
    if c.get('sub'):
        centre(c['sub'], fr(56, 500), 884 + o, GREY)
    for i, line in enumerate(c.get('aside', [])):
        centre(line, ImageFont.truetype(INTER, 43), 1020 + o + 62 * i, GREY)
    pf = ImageFont.truetype(INTER_M, 31); pt = c['pill']
    tw = d.textlength(pt, font=pf); px0 = (W - tw) / 2 - 40
    d.rounded_rectangle((px0, 1170 + o, W - px0, 1250 + o), 40, fill=NAVY)
    centre(pt, pf, 1170 + o + 24, (255, 255, 255))
    im.save(path)


def note_card(path, big, small):
    im = Image.new('RGB', (W, H), CREAM); d = ImageDraw.Draw(im)
    total = 60 + len(big) * 82 + 40 + len(small) * 54; y = (H - total) // 2
    d.text((96, y), "linguist's note", font=ImageFont.truetype(INTER, 34), fill=GREY); y += 70
    for line in big:
        d.text((96, y), line, font=fr(66), fill=NAVY); y += 82
    y += 40
    for line in small:
        d.text((96, y), line, font=ImageFont.truetype(INTER, 38), fill=GREY); y += 54
    im.save(path)


def main(spec_path, out):
    sp = json.load(open(spec_path)); raw = sp['raw']
    wd = os.path.splitext(out)[0] + '_build'; os.makedirs(wd, exist_ok=True)
    if sp['layout'] == 'scaled':
        y0 = sp.get('raw_y', 95); sh = 2400 - y0; sw = round(1080 * (H - HDR) / sh / 2) * 2
        bg = sp.get('pad', '0x0A0A16')
        gfilter = f"crop=1080:{sh}:0:{y0},scale={sw}:{H - HDR},pad={W}:{H - HDR}:(ow-iw)/2:0:{bg}"
    else:
        gfilter = f"crop=1080:{H - HDR}:0:{sp.get('raw_y', 513)}"
    headers, vfiles, afiles = {}, [], []
    vol = sp.get('sfx', 0)

    def still(img, dur, name):
        f = f'{wd}/{name}.mp4'
        run(['ffmpeg', '-v', 'error', '-y', '-loop', '1', '-framerate', '30', '-t', f'{dur}', '-i', img,
             '-vf', 'scale=1080:1920,setsar=1,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast',
             '-crf', '18', '-r', '30', f])
        return f, dur

    opening_card(sp['card'], sp['day'], f'{wd}/open.png')
    parts = [still(f'{wd}/open.png', sp.get('open_s', 3.0), 'c_open')]
    for i, p in enumerate(sp['pieces']):
        if p['cap'] not in headers:
            headers[p['cap']] = f'{wd}/hdr{len(headers):02d}.png'; header(sp['label'], p['cap'], headers[p['cap']])
        s, e = p['s'], p['e']; dur = p.get('dur') or (e - s) / p.get('speed', 1); speed = (e - s) / dur
        f = f'{wd}/seg{i:02d}.mp4'
        run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{s:.3f}', '-t', f'{e - s:.3f}', '-i', raw,
             '-loop', '1', '-i', headers[p['cap']], '-filter_complex',
             f"[0:v]setpts=(PTS-STARTPTS)/{speed:.5f},fps=30,{gfilter}[g];[1:v]fps=30,format=yuv420p[h];"
             f"[h][g]vstack,trim=duration={dur:.3f},setsar=1,format=yuv420p[v]",
             '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-r', '30', f])
        parts.append((f, dur, s, speed))
    for j, n in enumerate(sp.get('notes', [])):
        note_card(f'{wd}/note{j}.png', n['big'], n['small'])
        parts.append(still(f'{wd}/note{j}.png', n['dur'], f'c_note{j}'))
    parts.append(still(ENDCARD, sp.get('end_s', 2.5), 'c_end'))
    with open(f'{wd}/list.txt', 'w') as fh:
        fh.writelines(f"file '{p[0]}'\n" for p in parts)
    run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', f'{wd}/list.txt', '-c', 'copy',
         f'{wd}/silent.mp4'])
    total = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0',
                                  f'{wd}/silent.mp4'], capture_output=True, text=True).stdout)
    # sound effects: only from normal-speed pieces, hushed, placed at their output time
    inputs, filters, t = [], [], 0.0
    for p in parts:
        if len(p) == 4 and vol > 0 and abs(p[3] - 1) < 0.01:
            k = len(filters)
            inputs += ['-ss', f'{p[2]:.3f}', '-t', f'{p[1]:.3f}', '-i', raw]
            filters.append(f"[{k + 2}:a]aresample=44100,aformat=channel_layouts=stereo,volume={vol},"
                           f"adelay={int(t * 1000)}|{int(t * 1000)}[s{k}]")
        t += p[1]
    music = (f"[1:a]atrim=0:{total:.3f},aresample=44100,aformat=channel_layouts=stereo,"
             f"afade=t=out:st={total - 2:.3f}:d=2[m]")
    if filters:
        mix = ''.join(f'[s{k}]' for k in range(len(filters)))
        fc = music + ';' + ';'.join(filters) + f";[m]{mix}amix=inputs={len(filters) + 1}:normalize=0:duration=first[a]"
    else:
        fc = music.replace('[m]', '[a]')
    run(['ffmpeg', '-v', 'error', '-y', '-i', f'{wd}/silent.mp4', '-stream_loop', '-1', '-i', MUSIC_SRC, *inputs,
         '-filter_complex', fc, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k',
         '-shortest', '-movflags', '+faststart', out])
    Image.open(f'{wd}/open.png').save(out.replace('.mp4', '_thumb.png'))
    print('done', out, round(total, 2), 's')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
