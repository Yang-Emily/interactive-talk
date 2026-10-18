# Render a SketchMind-style flip GIF (usage: render-flip-gif.py out.gif 13824 5): handwritten digits, purple flip stroke, the segment turns 180°, then settles reversed.
import math, re, sys
from PIL import Image, ImageDraw, ImageFilter
OUT = sys.argv[1]
START_ARG = sys.argv[2] if len(sys.argv) > 2 else '31824'   # the numbers
K_ARG = int(sys.argv[3]) if len(sys.argv) > 3 else 3        # how many to flip from the front
DIGITS = {
 '1': ['M24 20 L33 10 L33 82'],
 '2': ['M12 28 C14 8 48 4 48 28 C48 46 26 60 12 80 L50 80'],
 '3': ['M12 22 C18 4 50 6 46 28 C44 40 32 44 26 44 C42 44 52 56 48 68 C44 86 16 88 10 72'],
 '4': ['M36 10 L10 58 L52 58', 'M38 30 L38 84'],
 '8': ['M30 44 C12 40 12 12 30 10 C48 12 48 40 30 44 C8 48 10 86 30 85 C52 86 52 48 30 44'],
}
def polyline(d, steps=18):
    toks = re.findall(r'[MLC]|-?\d+\.?\d*', d); pts=[]; i=0; cur=None
    while i < len(toks):
        t = toks[i]
        if t == 'M': cur=(float(toks[i+1]),float(toks[i+2])); pts.append(cur); i+=3
        elif t == 'L':
            i+=1
            while i < len(toks) and toks[i] not in 'MLC': cur=(float(toks[i]),float(toks[i+1])); pts.append(cur); i+=2
        elif t == 'C':
            i+=1
            while i < len(toks) and toks[i] not in 'MLC':
                p1=(float(toks[i]),float(toks[i+1])); p2=(float(toks[i+2]),float(toks[i+3])); p3=(float(toks[i+4]),float(toks[i+5])); i+=6
                p0=cur
                for k in range(1,steps+1):
                    u=k/steps; a=(1-u)**3; b=3*(1-u)**2*u; c=3*(1-u)*u*u; e=u**3
                    pts.append((a*p0[0]+b*p1[0]+c*p2[0]+e*p3[0], a*p0[1]+b*p1[1]+c*p2[1]+e*p3[1]))
                cur=p3
        else: i+=1
    return pts
SC = 2                       # supersample
W, H = 560, 500
DS = 1.3                     # digit scale (60x90 box)
GAP = 94
X0 = (W - (4*GAP + 60*DS)) / 2
Y0 = (H - 90*DS) / 2 - 10
INK = (20,20,20,255); PUR = (142,91,214,255)
def digit_pts(ch, slot):
    ox, oy = X0 + slot*GAP, Y0
    return [[((x*DS+ox)*SC, (y*DS+oy)*SC) for x,y in polyline(d)] for d in DIGITS[ch]]
def draw_digits(layer, items, color, width):
    dr = ImageDraw.Draw(layer)
    for ch, slot in items:
        for pl in digit_pts(ch, slot):
            dr.line(pl, fill=color, width=width*SC, joint='curve')
            r = width*SC/2
            for p in (pl[0], pl[-1]): dr.ellipse([p[0]-r,p[1]-r,p[0]+r,p[1]+r], fill=color)
START = list(START_ARG); K = K_ARG
END = START[:K][::-1] + START[K:]
seg_cx = (X0 + (K-1)*GAP/2 + 30*DS) * SC; seg_cy = (Y0 + 45*DS) * SC
ULY = (Y0 + 92*DS + 8) * SC
def underline(dr, frac, alpha=255):
    x1 = (X0 - 10)*SC; x2 = (X0 + (K-1)*GAP + 60*DS + 10)*SC
    xe = x1 + (x2-x1)*frac; pts=[]; n=40
    for k in range(n+1):
        x = x1 + (xe-x1)*k/n; pts.append((x, ULY + 3*SC*math.sin(x/(40*SC))))
    if len(pts) > 1: dr.line(pts, fill=PUR[:3]+(alpha,), width=4*SC, joint='curve')
def frame(phase):
    # phase: dict with underline frac, glow (0..1), angle (deg), settled bool, ul_alpha
    img = Image.new('RGBA', (W*SC, H*SC), (255,255,255,255))
    seg_items = [(START[i], i) for i in range(K)] if not phase['settled'] else [(END[i], i) for i in range(K)]
    rest = [(START[i], i) for i in range(K, len(START))]
    seg = Image.new('RGBA', img.size, (0,0,0,0))
    if phase['glow'] > 0:
        g = Image.new('RGBA', img.size, (0,0,0,0)); draw_digits(g, seg_items, PUR[:3]+(int(170*phase['glow']),), 14)
        seg = Image.alpha_composite(seg, g.filter(ImageFilter.GaussianBlur(9*SC)))
    draw_digits(seg, seg_items, INK, 5)
    if phase['angle']: seg = seg.rotate(-phase['angle'], resample=Image.BICUBIC, center=(seg_cx, seg_cy))
    img = Image.alpha_composite(img, seg)
    draw_digits(img, rest, INK, 5)
    if phase['ul'] > 0:
        ul = Image.new('RGBA', img.size, (0,0,0,0)); underline(ImageDraw.Draw(ul), phase['ul'], phase['ul_a'])
        img = Image.alpha_composite(img, ul)
    return img.resize((W, H), Image.LANCZOS).convert('RGB')
ease = lambda t: 0.5 - 0.5*math.cos(math.pi*max(0,min(1,t)))
frames=[]; durs=[]
def add(ph, ms): frames.append(frame(ph)); durs.append(ms)
base = dict(ul=0, ul_a=255, glow=0, angle=0, settled=False)
add(base, 700)                                                     # hold the start
for k in range(1,13): add({**base, 'ul': k/12}, 40)                # draw the flip stroke
for k in range(1,6):  add({**base, 'ul': 1, 'glow': k/5}, 40)      # segment lights up
add({**base, 'ul': 1, 'glow': 1}, 250)
for k in range(1,25): add({**base, 'ul': 1, 'glow': 1, 'angle': 180*ease(k/24)}, 40)   # half turn
for k in range(0,8):  add({**base, 'settled': True, 'ul': 1, 'ul_a': int(255*(1-k/7)), 'glow': 1-k/7}, 40)  # settle reversed, upright
add({**base, 'settled': True}, 1500)                              # hold the result
pal = [f.quantize(colors=64, method=Image.Quantize.MEDIANCUT) for f in frames]
pal[0].save(OUT, save_all=True, append_images=pal[1:], duration=durs, loop=0, optimize=True, disposal=1)
sheet = Image.new('RGB', (280*4, 250*2), 'white')
for j, k in enumerate([0, 8, 14, 22, 28, 34, 44, 51]):
    sheet.paste(frames[k].resize((280,250)), ((j%4)*280, (j//4)*250))
sheet.save(OUT.replace('.gif','-sheet.png'))
print(len(frames), 'frames', sum(durs), 'ms')
