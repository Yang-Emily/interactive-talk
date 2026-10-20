# Concept animation (not built in SketchMind yet): Dijkstra driven by three pens,
# ExtractMin, MarkVisited and RelaxEdge, in the deck's hand-drawn style.
# usage: python3 render-dijkstra-gif.py out.gif [scale]   (scale 2 renders a sharp 1240x800 GIF)
import math, sys, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter
OUT = sys.argv[1]
OS = float(sys.argv[2]) if len(sys.argv) > 2 else 1   # output scale
SC = 3; W, H = 620, 400
HAND = ImageFont.truetype('/System/Library/Fonts/Supplemental/Bradley Hand Bold.ttf', 34*SC)
HAND_S = ImageFont.truetype('/System/Library/Fonts/Supplemental/Bradley Hand Bold.ttf', 26*SC)
MONO = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 17*SC)
INK=(34,34,34); ORANGE=(232,134,42); GREEN=(43,138,62); PURPLE=(142,91,214); RED=(201,42,42); MUTE=(170,170,170)
N = {'S':(90,214), 'A':(301,101), 'B':(316,315), 'T':(527,207)}
E = [('S','A',4),('S','B',1),('B','A',2),('A','T',1),('B','T',5)]
LBL = {'S':(87,150), 'A':(302,40), 'B':(320,378), 'T':(532,144)}   # where each distance label sits
R = 30
TIP = [None]   # end of the stroke being drawn, where the pen tip sits
def P(p): return (p[0]*SC, p[1]*SC)
def pen_stroke(d, pts, col, w, seed=0, frac=1):
    """Smooth pressure variation, rounded tips, and no frame-to-frame jitter."""
    phase=random.Random(seed).uniform(0,math.tau)
    if frac<1: pts=pts[:max(2,round(len(pts)*frac))]
    TIP[0]=pts[-1]
    left,right=[],[]
    for i,(x,y) in enumerate(pts):
        a,b=pts[max(0,i-1)],pts[min(len(pts)-1,i+1)]
        dx,dy=b[0]-a[0],b[1]-a[1]
        length=math.hypot(dx,dy) or 1
        t=i/(len(pts)-1)
        pressure=(.88+.10*math.sin(math.pi*t)+.035*math.sin(math.tau*t+phase))
        pressure*=.80+.20*math.sin(math.pi*t)**.35
        r=w*pressure/2
        nx,ny=-dy/length*r,dx/length*r
        left.append(P((x+nx,y+ny)));right.append(P((x-nx,y-ny)))
    d.polygon(left+right[::-1],fill=col)
    for (x,y),t in ((pts[0],0),(pts[-1],1)):
        r=w*(.88+.035*math.sin(math.tau*t+phase))*.80/2
        d.ellipse((P((x-r,y-r)),P((x+r,y+r))),fill=col)


def wobbly_line(d, a, b, col, w, seed, frac=1):
    # A pen drifts gently along a stroke; fresh noise at every sample looks serrated.
    rnd=random.Random(seed)
    bow,phase=rnd.uniform(-2.8,2.8),rnd.uniform(0,math.tau)
    (x1,y1),(x2,y2)=a,b
    dx,dy=x2-x1,y2-y1
    length=math.hypot(dx,dy)
    nx,ny=-dy/length,dx/length
    pts=[]
    for k in range(81):
        t=k/80
        off=math.sin(math.pi*t)*(bow+.55*math.sin(math.tau*t+phase))
        pts.append((x1+dx*t+nx*off,y1+dy*t+ny*off))
    pen_stroke(d,pts,col,w,seed,frac)


def wobbly_circle(d, c, r, col, w, fill=None, seed=0, frac=1):
    rnd=random.Random(seed)
    phase,rotation=rnd.uniform(0,math.tau),rnd.uniform(-.10,.10)
    rx,ry=r*rnd.uniform(.97,1.04),r*rnd.uniform(.97,1.04)
    start=-1.1+rnd.uniform(-.3,.3)
    pts=[]
    for i in range(125):
        # A short tapered overlap is the natural finish of a single pen loop.
        a=start+(math.tau+.10)*i/124
        drift=1+.012*math.sin(2*a+phase)+.008*math.sin(5*a-phase)
        x,y=rx*drift*math.cos(a),ry*drift*math.sin(a)
        pts.append((c[0]+x*math.cos(rotation)-y*math.sin(rotation),
                    c[1]+x*math.sin(rotation)+y*math.cos(rotation)))
    if fill: d.polygon([P(p) for p in pts[:123]],fill=fill)
    pen_stroke(d,pts,col,w,seed,frac)
def hand_inf(d, c, size=17, seed=0, col=INK):
    """A hand-drawn infinity sign: one continuous loop with a slight tilt and wobble."""
    rnd=random.Random(seed); tilt=rnd.uniform(-.12,.06); ph=rnd.uniform(0,math.tau)
    pts=[]
    for i in range(97):
        t=-math.pi/2+math.tau*1.04*i/96
        den=1+math.sin(t)**2
        x=size*math.cos(t)/den*(1+.04*math.sin(3*t+ph)); y=size*.95*math.sin(t)*math.cos(t)/den
        pts.append((c[0]+x*math.cos(tilt)-y*math.sin(tilt), c[1]+x*math.sin(tilt)+y*math.cos(tilt)))
    pen_stroke(d,pts,col,2.9,seed)
def check_pts(x, y):
    """A bold hand-drawn tick: short down-stroke, then a long up-stroke."""
    return [(x-9+5*t,y-1+7*t) for t in (0,.25,.5,.75,1)]+[(x-4+16*t,y+6-17*t+1.5*math.sin(math.pi*t)) for t in (.15,.3,.45,.6,.75,.9,1)]
def edge_ends(u, v):
    (x1,y1),(x2,y2)=N[u],N[v]; L=math.hypot(x2-x1,y2-y1); ux,uy=(x2-x1)/L,(y2-y1)/L
    return (x1+ux*(R+4), y1+uy*(R+4)), (x2-ux*(R+4), y2-uy*(R+4))
def ctext(image, xy, s, font, col):
    # Slightly different tilt and spacing for each handwritten annotation.
    # The seed stays fixed for a label, so static handwriting never boils.
    rnd=random.Random(round(xy[0]*37+xy[1]*71)+sum(ord(ch)*13 for ch in s))
    bb=ImageDraw.Draw(image).textbbox((0,0),s,font=font)
    patch=Image.new('RGBA',(bb[2]-bb[0]+12*SC,bb[3]-bb[1]+12*SC))
    ImageDraw.Draw(patch).text((6*SC-bb[0],6*SC-bb[1]),s,font=font,fill=col)
    patch=patch.resize((round(patch.width*rnd.uniform(.97,1.03)),patch.height),Image.Resampling.LANCZOS)
    patch=patch.rotate(rnd.uniform(-3.5,3.5),resample=Image.Resampling.BICUBIC,expand=True)
    image.paste(patch,(round(xy[0]*SC-patch.width/2),round(xy[1]*SC-patch.height/2)),patch)
def frame(st):
    img=Image.new('RGB',(W*SC,H*SC),'white')
    wash=Image.new('RGBA',img.size,(0,0,0,0)); wd=ImageDraw.Draw(wash)
    pr=st.get('p',1); tip=None
    if st.get('cur') and st.get('pen')=='ExtractMin':
        wobbly_circle(wd,N[st['cur']],R+6,PURPLE+(65,),7,seed=ord(st['cur']),frac=pr); tip=TIP[0]
    elif st.get('cur'): wobbly_circle(wd,N[st['cur']],R+6,PURPLE+(65,),7,seed=ord(st['cur']))
    if st.get('edge'):
        a,b=edge_ends(*st['edge']);wobbly_line(wd,a,b,ORANGE+(75,),8,3,frac=pr); tip=TIP[0]
    # A narrow highlighter wash feels like ink on paper rather than a digital glow.
    wash=wash.filter(ImageFilter.GaussianBlur(.6*SC))
    img.paste(wash,(0,0),wash)
    d=ImageDraw.Draw(img)
    path=set(st.get('path',[]))
    for i,(u,v,w) in enumerate(E):
        a,b=edge_ends(u,v); on = st.get('edge') in [(u,v),(v,u)]; inpath=(u,v) in path or (v,u) in path
        if inpath and (u,v) in st.get('drawing',{}):
            wobbly_line(d,a,b,INK,3.1,i); wobbly_line(d,a,b,GREEN,4.3,i,frac=st['drawing'][(u,v)]); tip=TIP[0] if st['drawing'][(u,v)]<1 else tip
        else: wobbly_line(d,a,b,GREEN if inpath else (ORANGE if on and pr>=1 else INK),4.3 if inpath else 3.1,i)
        mx,my=(N[u][0]+N[v][0])/2,(N[u][1]+N[v][1])/2; L=math.hypot(N[v][0]-N[u][0],N[v][1]-N[u][1])
        ox,oy=-(N[v][1]-N[u][1])/L*20,(N[v][0]-N[u][0])/L*20
        ctext(img,(mx+ox,my+oy),str(w),HAND_S, ORANGE if on and pr>=1 else (GREEN if inpath else (110,110,110)))
    for k,c in N.items():
        visited = k in st['visited']
        wobbly_circle(d,c,R,INK,3.1,fill=(237,247,239) if visited else 'white',seed=ord(k))
        ctext(img,c,k,HAND,INK)
        if visited:
            x,y=c[0]+R+2,c[1]-R+2
            ck=check_pts(x,y)
            f=pr if st.get('pen')=='MarkVisited' and st.get('cur')==k else 1
            pen_stroke(d,ck,GREEN,3.2,ord(k),frac=f)
            if f<1: tip=TIP[0]
    for k,(x,y) in LBL.items():
        hist = st['dist'][k]                      # list of values; last is current, earlier ones are struck
        cur = hist[-1]; s = '∞' if cur is None else str(cur)
        if len(hist) > 1 and hist[-2] is not None:
            old=str(hist[-2]); ctext(img,(x-30,y),old,HAND_S,MUTE)
            bb=d.textbbox((0,0),old,font=HAND_S); w=(bb[2]-bb[0])/SC
            wobbly_line(d,(x-30-w/2-3,y+3),(x-30+w/2+3,y-2),RED,2,ord(k))
            ctext(img,(x+6,y),s,HAND,RED if st.get('changed')==k else INK)
        elif cur is None:
            hand_inf(d,(x,y),seed=ord(k))
        else:
            ctext(img,(x,y),s,HAND,RED if st.get('changed')==k else INK)
    pen=st.get('pen')
    if pen:
        col={'ExtractMin':PURPLE,'MarkVisited':GREEN,'RelaxEdge':ORANGE,'shortest path':GREEN}[pen]
        label='✎ '+pen if pen!='shortest path' else 'S → B → A → T'
        bb=d.textbbox((0,0),label,font=MONO); w=bb[2]-bb[0]
        x0,y0=16*SC,14*SC
        d.rounded_rectangle([x0,y0,x0+w+24*SC,y0+34*SC], radius=10*SC, fill=tuple(int(v*0.12+255*0.88) for v in col), outline=col, width=2*SC)
        d.text((x0+12*SC,y0+7*SC-bb[1]+2*SC),label,font=MONO,fill=col)
    if tip is not None:   # stylus tip on the stroke being drawn
        x,y=tip; d.ellipse((P((x-5,y-5)),P((x+5,y+5))),fill=(90,90,90)); d.ellipse((P((x-2.2,y-2.2)),P((x+2.2,y+2.2))),fill='white')
    return img.resize((round(W*OS),round(H*OS)),Image.LANCZOS)
INF=None
seq=[]
dist={'S':[0],'A':[INF],'B':[INF],'T':[INF]}; vis=set()
def snap(ms, **kw):
    seq.append((frame({'dist':{k:list(v) for k,v in dist.items()},'visited':set(vis),**kw}), ms))
STEPS = 7          # frames per drawn stroke
STROKE_MS = 45     # time per stroke frame
def draw(hold, **kw):
    """Draw the active stroke over STEPS frames, then hold the finished state."""
    for j in range(1, STEPS):
        snap(STROKE_MS, p=j/STEPS, **kw)
    snap(hold, **kw)
def extract(k):
    draw(650, pen='ExtractMin', cur=k)
def mark(k):
    vis.add(k); draw(500, pen='MarkVisited', cur=k)
def relax(u, v, new):
    draw(250, pen='RelaxEdge', edge=(u,v))               # trace the edge first
    dist[v].append(new); snap(800, pen='RelaxEdge', edge=(u,v), changed=v)   # then the label updates
snap(1000)
extract('S'); mark('S'); relax('S','A',4); relax('S','B',1)
extract('B'); mark('B'); relax('B','A',3); relax('B','T',6)
extract('A'); mark('A'); relax('A','T',4)
extract('T'); mark('T')
path=[('S','B'),('B','A'),('A','T')]
for i,e in enumerate(path):             # the shortest path is traced edge by edge
    for j in range(1, STEPS+1):
        snap(STROKE_MS if j<STEPS else 120, pen='shortest path', path=path[:i+1], drawing={e: j/STEPS})
snap(2600, pen='shortest path', path=path)
frames=[f for f,_ in seq]; durs=[m for _,m in seq]
pal=[f.quantize(colors=80, method=Image.Quantize.MEDIANCUT) for f in frames]
pal[0].save(OUT, save_all=True, append_images=pal[1:], duration=durs, loop=0, optimize=True)
keys=[f for f,ms in seq if ms>=250]   # contact sheet of the held states
sheet=Image.new('RGB',(310*4,200*((len(keys)+3)//4)),'white')
for j,f in enumerate(keys): sheet.paste(f.resize((310,200)),((j%4)*310,(j//4)*200))
sheet.save(OUT.replace('.gif','-sheet.png'))
print(len(frames),'frames',sum(durs),'ms')
