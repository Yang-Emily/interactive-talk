"""Render a fresh, silent handwriting animation; no source video or red marks."""
from pathlib import Path
import math, subprocess
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
W,H,FPS = 640,540,24
# Pen trajectories, normalized to a 40 x 60 writing cell.
INK = {
 '1': [[(17,5),(19,16),(19,31),(20,47),(19,58)]],
 '2': [[(5,14),(10,9),(19,7),(28,9),(32,15),(31,23),(26,31),(18,39),(8,49),(5,53),(17,51),(29,52),(35,54)]],
 '3': [[(5,8),(14,5),(24,7),(30,12),(31,20),(27,27),(19,31),(14,32),(23,32),(31,37),(34,44),(32,51),(26,57),(16,61)]],
 '4': [[(10,7),(7,20),(5,32),(8,36),(18,37),(33,34)],[(25,11),(24,26),(24,42),(25,58)]],
 '5': [[(12,6),(10,19),(10,28),(18,34),(28,40),(31,48),(27,55),(17,59),(7,58)],[(11,25),(22,22),(34,20)]],
}
def smooth(points):
    # Catmull-Rom interpolation retains the slight irregularity of pen strokes.
    out=[]
    q=[points[0]]+points+[points[-1]]
    for i in range(1,len(q)-2):
        p0,p1,p2,p3=q[i-1:i+3]
        for j in range(9):
            t=j/9
            out.append(tuple(.5*((2*p1[k])+(-p0[k]+p2[k])*t+(2*p0[k]-5*p1[k]+4*p2[k]-p3[k])*t*t+(-p0[k]+3*p1[k]-3*p2[k]+p3[k])*t*t*t) for k in (0,1)))
    return out+[points[-1]]
INK={k:[smooth(p) for p in paths] for k,paths in INK.items()}
def glyph(draw,char,x,y,size,progress,seed):
    paths=INK[char]; total=sum(len(p) for p in paths); left=progress*total
    for path in paths:
        count=min(len(path),max(0,int(left))); left-=len(path)
        if count<2: continue
        # Consistent slight variation between handwritten instances.
        lean=math.sin(seed*2.3)*.035
        pts=[(x+(a+lean*b)*size/60,y+b*size/60) for a,b in path[:count]]
        draw.line(pts,fill=(36,34,33),width=max(2,round(size*.044)),joint='curve')
def states():
    a=[5,2,3,4,1]; result=[(a.copy(),None,False)]
    for end in range(len(a)-1,0,-1):
        for j in range(end):
            swap=a[j]>a[j+1]
            result.append((a.copy(),j,swap))
            if swap: a[j],a[j+1]=a[j+1],a[j]
            result.append((a.copy(),None,False))
    return result
seq=states()
row_seconds=.28
# Skip the unscaled opening: frame 0 shows the first rows, just before the pull-back starts.
START_ROWS=5
duration=(len(seq)-START_ROWS)*row_seconds+1.1
output=ROOT/'media/trace-explosion-writing.mp4'
proc=subprocess.Popen(['ffmpeg','-y','-hide_banner','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',str(output)],stdin=subprocess.PIPE)
try:
    for frame in range(math.ceil(duration*FPS)):
        im=Image.new('RGB',(W,H),'white');draw=ImageDraw.Draw(im)
        row_pos=min(len(seq),START_ROWS+frame/FPS/row_seconds)
        # Pull back continuously on a single sheet; the full trace stays visible.
        scale=min(1.2,490/max(390,45+row_pos*69))
        def pen(points,progress=1,width=2):
            count=max(0,int(len(points)*progress))
            if count>1:
                draw.line([(W/2+(x-240)*scale,18+y*scale) for x,y in points[:count]],fill='#292625',width=max(1,round(width*scale)),joint='curve')
        for n in range(min(len(seq),int(row_pos)+1)):
            vals,pair,swap=seq[n]
            y=12+n*69
            size=50+math.sin(n*1.9)*3
            pitch=48+math.sin(n)*3
            x=95+math.sin(n*1.7)*34+math.sin(n*.4)*18
            local=max(0,min(1,row_pos-n))
            for j,v in enumerate(vals):
                progress=max(0,min(1,local*6.4-j))
                gx=W/2+(x+j*pitch-240)*scale
                gy=18+(y+math.sin(n*2+j)*2)*scale
                glyph(draw,str(v),gx,gy,size*scale,progress,n*5+j)
            mark=max(0,min(1,(local-.77)/.23))
            if pair is not None:
                left=x+pair*pitch-2;right=left+pitch+31
                pen(smooth([(left,y+55),(left+27,y+59),(right,y+53)]),mark,2.8)
                if swap:
                    arc=smooth([(left+8,y+9),(left+18,y-12),(right-18,y-17),(right-6,y+6)])
                    pen(arc,mark,2.4)
                    pen([(right-17,y-1),(right-6,y+6),(right-4,y-6)],mark,2.4)
                if n%3==0:
                    pen(smooth([(left-5,y+59),(left+30,y+62),(right+13,y+57)]),mark,1.7)
            elif n>0 and n%4==0:
                # Loose linking strokes and overwritten marks break the visual rhythm.
                pen(smooth([(x+246,y-13),(x+271,y+12),(x+253,y+48),(x+238,y+68)]),mark,2)
                pen([(x+245,y+60),(x+238,y+68),(x+252,y+68)],mark,2)
        proc.stdin.write(im.tobytes())
finally:
    proc.stdin.close()
    code=proc.wait()
    if code: raise SystemExit(code)
subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-i',str(output),'-filter_complex','fps=18,split[a][b];[a]palettegen=max_colors=32[p];[b][p]paletteuse=dither=none','-loop','-1',str(ROOT/'assets/challenge-trace-explosion.gif')],check=True)
print(output)
