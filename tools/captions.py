# Renders caption PNGs (1080x230, transparent). Text: lines split by '|', *word* = gold.
import json, sys, re
from PIL import Image, ImageDraw, ImageFont
F='/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf'
W,H=1080,230
GOLD=(253,196,69); WHITE=(255,255,255)
caps=json.load(open(sys.argv[1]))
for i,c in enumerate(caps):
    lines=c['text'].split('|')
    size=48
    font=ImageFont.truetype(F,size)
    im=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(im)
    def segs(line): return [(p.strip('*'), p.startswith('*')) for p in re.split(r'(\*[^*]+\*)',line) if p]
    widths=[sum(d.textlength(t,font=font) for t,_ in segs(l)) for l in lines]
    while max(widths)+70>1040:
        size-=2; font=ImageFont.truetype(F,size)
        widths=[sum(d.textlength(t,font=font) for t,_ in segs(l)) for l in lines]
    lh=64; th=lh*len(lines)
    bw=max(widths)+70; bh=th+40
    x0=(W-bw)/2; y0=(H-bh)/2
    d.rounded_rectangle([x0,y0,x0+bw,y0+bh],radius=28,fill=(20,22,48,225),outline=(90,200,230,255),width=3)
    y=y0+20
    for l,w in zip(lines,widths):
        x=(W-w)/2
        for t,g in segs(l):
            d.text((x,y),t,font=font,fill=GOLD if g else WHITE); x+=d.textlength(t,font=font)
        y+=lh
    im.save(f'cap_{i:02d}.png')
print(len(caps))
