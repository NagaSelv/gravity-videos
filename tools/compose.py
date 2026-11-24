import json,subprocess,sys
out=sys.argv[1]
caps=json.load(open('caps.json'))
inputs=['-loop','1','-framerate','30','-i','bg2.png','-i','in/rec.mp4','-loop','1','-framerate','30','-i','open.png','-loop','1','-framerate','30','-i','close2.png','-i','/home/claude/in/t.mp4']
for i in range(len(caps)): inputs+=['-loop','1','-framerate','30','-t','82','-i',f'cap_{i:02d}.png']
f=["[1:v]fps=30,crop=1080:2245:0:100,scale=712:1480:flags=lanczos,setsar=1,tpad=stop_mode=clone:stop_duration=6[g]",
   "[0:v][g]overlay=184:420,trim=0:81[b0]"]
prev='b0'
for i,c in enumerate(caps):
    s,e=c['s'],c['e']
    f.append(f"[{5+i}:v]format=rgba,fade=t=in:st={s}:d=0.25:alpha=1,fade=t=out:st={e-0.25}:d=0.25:alpha=1[c{i}]")
    f.append(f"[{prev}][c{i}]overlay=0:170:enable='between(t,{s},{e})'[b{i+1}]"); prev=f'b{i+1}'
f+=[ "[2:v]format=rgba,fade=t=out:st=2.4:d=0.5:alpha=1,trim=0:3[o]",
     f"[{prev}][o]overlay=0:0:eof_action=pass[bo]",
     "[3:v]format=rgba,fade=t=in:st=0:d=0.6:alpha=1,trim=0:4.1,setpts=PTS+77/TB[cl]",
     "[bo][cl]overlay=0:0:eof_action=pass,trim=0:81,format=yuv420p[v]",
     "[1:a]aformat=sample_rates=44100:channel_layouts=stereo,afade=t=in:d=0.3,afade=t=out:st=74.2:d=1.2[a1]",
     "[4:a]aformat=sample_rates=44100:channel_layouts=stereo,atrim=20:27,asetpts=PTS-STARTPTS,afade=t=in:d=1.0,afade=t=out:st=4.6:d=2.0,adelay=74200|74200[a2]",
     "[a1][a2]amix=inputs=2:duration=longest:normalize=0,atrim=0:81[a]"]
subprocess.run(['ffmpeg','-v','error','-y']+inputs+['-filter_complex',';'.join(f),'-map','[v]','-map','[a]','-c:v','libx264','-preset','veryfast','-crf','20','-c:a','aac','-b:a','160k','-movflags','+faststart',out],check=True)
