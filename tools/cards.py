import random, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
W,H=1080,1920
F='/home/claude/Bungee-Regular.ttf'
GOLD=(253,196,69); BLUE=(200,227,251); WHITE=(255,255,255)
date=sys.argv[1]
def starfield(seed):
    im=Image.new('RGB',(W,H),(12,11,24)); d=ImageDraw.Draw(im)
    for y in range(H):
        t=y/(H-1); d.line([(0,y),(W,y)],fill=(round(10+8*t),round(10+12*t),round(24+28*t)))
    r=random.Random(seed)
    for _ in range(260):
        x,y=r.uniform(0,W),r.uniform(0,H); s=r.choice([.8,1,1,1.3,1.8,2.3]); a=r.randint(110,255)
        d.ellipse([x-s,y-s,x+s,y+s],fill=(a,a,min(255,a+15)))
    return im
def text(d,cx,y,s,size,col,sh=5):
    f=ImageFont.truetype(F,size); w=d.textlength(s,font=f)
    while w>W-80: size-=2; f=ImageFont.truetype(F,size); w=d.textlength(s,font=f)
    d.text((cx-w/2+sh*.5,y+sh),s,font=f,fill=(3,5,15)); d.text((cx-w/2,y),s,font=f,fill=col)
src=Image.open('/home/claude/t1.png').convert('RGB')
icon=src.crop((390,520,690,820))
def put_icon(im,size,y):
    ic=icon.resize((size,size),Image.LANCZOS)
    m=Image.new('L',(size,size),0); ImageDraw.Draw(m).rounded_rectangle([0,0,size-1,size-1],radius=size//5,fill=255)
    im.paste(ic,((W-size)//2,y),m.filter(ImageFilter.GaussianBlur(1.2)))
# background behind gameplay: plain game colour + band text on top
bg=Image.new('RGB',(W,H),(12,11,24)); d=ImageDraw.Draw(bg)
r=random.Random(3)
for _ in range(160):
    x,y=r.uniform(0,W),r.uniform(0,H); s=r.choice([.8,1,1.3,1.8]); a=r.randint(90,220)
    d.ellipse([x-s,y-s,x+s,y+s],fill=(a,a,min(255,a+15)))
text(d,W/2,38,'HIGH SCORE CHALLENGE',58,WHITE,5)
text(d,W/2,118,date,40,GOLD,4)
bg.save('bg.png')
# opening card
o=starfield(1); d=ImageDraw.Draw(o)
put_icon(o,260,520)
text(d,W/2,860,'GRAVITY!',120,WHITE,8)
text(d,W/2,1010,'HIGH SCORE CHALLENGE',58,GOLD,5)
text(d,W/2,1090,date,46,BLUE,4)
text(d,W/2,1290,'10 BLOCKS. 3 TRIES.',44,WHITE,4)
text(d,W/2,1350,'WATCH MY BEST TRY',44,WHITE,4)
o.save('open.png')
# closing card
c=starfield(2); d=ImageDraw.Draw(c)
put_icon(c,260,470)
text(d,W/2,800,'GRAVITY!',120,WHITE,8)
text(d,W/2,950,'THE WORD GAME',58,GOLD,5)
text(d,W/2,1150,'A NEW CHALLENGE',50,WHITE,4)
text(d,W/2,1215,'EVERY DAY',50,WHITE,4)
text(d,W/2,1360,'FREE ON',58,BLUE,5)
text(d,W/2,1430,'GOOGLE PLAY',58,GOLD,5)
c.save('close.png')
