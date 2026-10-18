"""Animate only pixels from the paper overview, one narrated feature per MP4.

No generated hands, replacement lettering, or drawn annotations. Layers are crops
of overview-updated.png. Masks reveal existing ink; original hands/cards translate or
scale, then settle exactly into the source figure. Requires Pillow and ffmpeg.
Run from any directory: python3 sketchmind/scripts/render-overview.py
Use --preview to render contact sheets without encoding videos.
Use --beat 2 to render only the reusable-pen sequence.
"""
from pathlib import Path
from io import BytesIO
from bisect import bisect_right
import argparse
import math
import subprocess
from PIL import Image, ImageDraw, ImageChops, ImageFilter, ImageCms

ROOT = Path(__file__).resolve().parents[1]
# The updated export keeps every element at its original size and shifts the
# composition down 71 px. Keep the carefully traced masks and motion paths in
# their original coordinate system, and register them to the new canvas here.
OFFSET = (0, 71)
original = Image.open(ROOT / 'assets/overview-updated.png').convert('RGBA')
if original.info.get('icc_profile'):
    original = ImageCms.profileToProfile(original,
        ImageCms.ImageCmsProfile(BytesIO(original.info['icc_profile'])),
        ImageCms.createProfile('sRGB'), outputMode='RGBA')
paper = Image.new('RGBA', original.size, 'white')
paper.alpha_composite(original)
SOURCE = paper.convert('RGB')
SIZE = (1920, 822)
BASE = SOURCE.resize(SIZE, Image.Resampling.LANCZOS)
SX, SY = SIZE[0] / SOURCE.width, SIZE[1] / SOURCE.height
FPS = 60
LAYER_ASSETS = ROOT / 'assets/overview-layers'
DURATIONS = (8, 6, 5, 5, 6)
# Output seconds → original choreography seconds. Trim pauses more than the
# gestures, so the quick overview still reads as select → draw → response.
TIMELINES = (
    ((0,0),(.25,.5),(.6,1.2),(1.65,2.85),(2.05,3.6),(2.35,4.25),
     (2.7,4.95),(3.22,5.75),(3.58,6.4),(4.05,7.3),(4.4,7.95),
     (4.92,8.75),(5.5,9.8),(6,10.7),(6.35,11.35),(6.87,12.15),
     (7.25,12.85),(7.55,13.35),(8,14)),
    ((0,0),(.6,1.1),(1.45,2.35),(2.05,3.3),(2.35,3.85),(2.65,4.5),
     (3.6,6),(4.15,6.9),(4.65,7.75),(5.15,9),(5.55,9.35),(6,10)),
    ((0,0),(.25,.8),(.7,1.45),(.95,1.8),(1.35,2.35),(1.55,3.2),
     (2.3,4.35),(2.55,4.7),(2.95,5.25),(3.2,6.1),(3.8,6.85),
     (4.35,7.35),(5,8)),
    ((0,0),(.8,1.3),(2.05,3.3),(2.4,3.8),(3.5,5.5),
     (4.2,6.75),(4.55,7.35),(5,8)),
    ((0,0),(.15,.25),(.95,1.65),(1.1,1.9),(1.95,3.15),(2.6,4.15),
     (2.9,4.7),(3.1,5),(3.75,6),(4.4,7.05),(4.95,7.9),
     (5.25,9),(5.55,9.35),(6,10)),
)


def clock_slopes(points):
    """Monotone cubic tangents: continuous speed without event reordering."""
    spans = [b[0]-a[0] for a,b in zip(points,points[1:])]
    rates = [(b[1]-a[1])/h for a,b,h in zip(points,points[1:],spans)]
    slopes = [rates[0]]
    for i in range(1,len(points)-1):
        w1,w2 = 2*spans[i]+spans[i-1],spans[i]+2*spans[i-1]
        slopes.append((w1+w2)/(w1/rates[i-1]+w2/rates[i]))
    return slopes+[rates[-1]]


CLOCK_SLOPES = tuple(clock_slopes(points) for points in TIMELINES)


def source_time(index, t):
    """Run the existing precise choreography on the faster, smooth clock."""
    points,slopes = TIMELINES[index],CLOCK_SLOPES[index]
    if t <= points[0][0]: return points[0][1]
    if t >= points[-1][0]: return points[-1][1]
    i = bisect_right([p[0] for p in points],t)-1
    a,b = points[i],points[i+1]
    h = b[0]-a[0]
    u = (t-a[0])/h
    return ((2*u**3-3*u**2+1)*a[1] + (u**3-2*u**2+u)*h*slopes[i]
            + (-2*u**3+3*u**2)*b[1] + (u**3-u**2)*h*slopes[i+1])


def native_box(b):
    return tuple(v + OFFSET[i % 2] for i, v in enumerate(b))


def box(b):
    return tuple(round(v * (SX if i % 2 == 0 else SY)) for i, v in enumerate(native_box(b)))


def registered(image):
    """Place a legacy mask/sprite on the updated figure without rescaling it."""
    canvas = Image.new(image.mode, SOURCE.size, 0)
    canvas.paste(image, OFFSET)
    return canvas


def progress(t, start, duration):
    return max(0., min(1., (t - start) / duration))


def ease(u):
    return u * u * (3 - 2 * u)


class Layer:
    """An unmodified piece of the source; only its transform/visibility changes."""
    def __init__(self, bounds, start=0, duration=.5, kind='card', bg='white', polygon=None, dx=0, dy=0, colored=False, neutral=False, mask_dilation=1, asset=None, sprite=None):
        original_bounds = bounds
        if asset:
            native_mask = Image.open(LAYER_ASSETS / 'masks' / f'{asset}.png').convert('L')
            erase_file=LAYER_ASSETS/'masks'/f'{asset}-erase.png'
            native_erase=Image.open(erase_file).convert('L') if erase_file.exists() else None
            # The new export's antialiasing extends a few edges beyond the
            # original footprint. Widen only their erase mask, keeping the
            # isolated moving element and its neighboring marks untouched.
            if asset in ('b-drag-hand','d-array','c-index-tab','c-param-tab'):
                native_erase=(native_erase or native_mask).filter(ImageFilter.MaxFilter(5))
            bounds = ImageChops.lighter(native_mask,native_erase).getbbox() if native_erase else native_mask.getbbox()
            if not bounds: raise ValueError(f'Empty element mask: {asset}')
        else:
            native_mask = None
            if polygon:
                bounds = (bounds[0]-2, bounds[1]-2, bounds[2]+2, bounds[3]+2)
        self.bounds = box(bounds)
        self.x, self.y, x1, y1 = self.bounds
        self.size = (x1 - self.x, y1 - self.y)
        self.asset = asset
        self.erase_mask = registered(native_erase).resize(SIZE,Image.Resampling.LANCZOS).crop(self.bounds) if asset and native_erase else None
        if asset:
            native = registered(Image.open(LAYER_ASSETS/'sprites'/f'{sprite}.png').convert('RGBA')) if sprite else SOURCE.convert('RGBA')
            native.putalpha(registered(native_mask))
            # Resize premultiplied RGBA after isolating the source element. This
            # prevents neighboring ink bleeding into a downsampled edge.
            isolated=native.resize(SIZE,Image.Resampling.LANCZOS).crop(self.bounds)
            self.mask=isolated.getchannel('A')
            self.pixels=isolated.convert('RGB')
        else:
            self.pixels = BASE.crop(self.bounds)
            self.mask = Image.new('L', self.size, 255)
            if polygon:
                self.mask = Image.new('L', self.size)
                ImageDraw.Draw(self.mask).polygon([(round((x+OFFSET[0])*SX)-self.x, round((y+OFFSET[1])*SY)-self.y) for x,y in polygon], fill=255)
                if mask_dilation>1:self.mask = self.mask.filter(ImageFilter.MaxFilter(mask_dilation))
            if colored:
                chroma = Image.new('L', self.size)
                chroma.putdata([255 if max(rgb)-min(rgb)>25 or (min(rgb)>210 and max(rgb)-min(rgb)>3) else 0 for rgb in self.pixels.getdata()])
                self.mask = ImageChops.multiply(self.mask, chroma)
            if neutral:
                neutral_mask=Image.new('L',self.size)
                neutral_mask.putdata([255 if max(rgb)-min(rgb)<18 else 0 for rgb in self.pixels.getdata()])
                self.mask=ImageChops.multiply(self.mask,neutral_mask)
        clean_background=LAYER_ASSETS/'backgrounds'/f'{asset}.png' if asset else None
        if clean_background and clean_background.exists():
            bg=Image.open(clean_background).convert('RGB').resize(self.size,Image.Resampling.LANCZOS)
            bg.info['figure_bounds']=bounds
        if isinstance(bg,Image.Image):
            bg_bounds=box(bg.info.get('figure_bounds',original_bounds))
            aligned=Image.new('RGB',self.size,'white')
            aligned.paste(bg,(bg_bounds[0]-self.x,bg_bounds[1]-self.y))
            bg=aligned
        self.start, self.duration, self.kind, self.bg = start, duration, kind, bg
        self.dx, self.dy = dx, dy

    def clear(self, image):
        image.paste(self.bg, self.bounds, (self.erase_mask if self.erase_mask is not None else self.mask).point(lambda a:255 if a>1 else 0))

    def paint(self, image, t):
        u = progress(t, self.start, self.duration)
        mask, pixels = self.mask, self.pixels
        x, y = self.x, self.y
        if self.kind == 'hand':
            # Move the original silhouette, including its own pen. A smooth press
            # returns it to its exact original position, with no duplicate hand.
            pulse = math.sin(math.pi*u)**2
            x += round(self.dx * SX * pulse)
            y += round(self.dy * SY * pulse)
        elif self.kind == 'ink':
            # Reveal the actual handwritten pixels in short vertical sweeps,
            # never replace the handwriting with a newly drawn path.
            reveal = Image.new('L', self.size)
            w, h = self.size
            columns = 5
            d = ImageDraw.Draw(reveal)
            for k in range(columns):
                amount = max(0, min(1, u * columns - k))
                if amount:
                    d.rectangle((round(k*w/columns), 0, round((k+1)*w/columns), round(h*amount)), fill=255)
            mask = ImageChops.multiply(mask, reveal)
        elif self.kind in ('wipe', 'arrow'):
            reveal = Image.new('L', self.size)
            d = ImageDraw.Draw(reveal)
            w,h = self.size
            if self.kind == 'arrow': d.rectangle((round(w*(1-u)), 0, w, h), fill=255)
            elif u: d.rectangle((0,0,round(w*u),h), fill=255)
            mask = ImageChops.multiply(mask, reveal)
        elif self.kind == 'tap':
            # Compress the existing button pixels around their own center.
            scale = 1 - .08 * math.sin(math.pi*u)**2
            w,h = self.size
            target = (max(1,round(w*scale)), max(1,round(h*scale)))
            pixels = pixels.resize(target, Image.Resampling.LANCZOS)
            mask = mask.resize(target, Image.Resampling.LANCZOS)
            x += (w-target[0])//2; y += (h-target[1])//2
        else:
            mask = mask.point(lambda a: round(a*ease(u)))
            # UI cards stay anchored; reveal their own pixels without moving a crop.
        image.paste(pixels, (x,y), mask)


class PenLayer(Layer):
    """Keep the original chip neutral until the learner selects this pen."""
    def __init__(self,*args,**kwargs):
        super().__init__(*args,**kwargs)
        self.default=self.pixels.copy()
        self.default.putdata([tuple([254]*3) if min(rgb)>215 else rgb for rgb in self.pixels.getdata()])

    def paint(self,image,t):
        u=ease(progress(t,self.start,self.duration))
        image.paste(Image.blend(self.default,self.pixels,u),(self.x,self.y),self.mask)


class TraceHandLayer(Layer):
    """An original hand appears only after pen selection, then follows its ink."""
    def __init__(self,*args,path,stroke_start,stroke_duration,tip,**kwargs):
        super().__init__(*args,**kwargs)
        self.path,self.stroke_start,self.stroke_duration,self.tip=path,stroke_start,stroke_duration,tip

    def paint(self,image,t):
        if t<self.start:return
        u=ease(progress(t,self.stroke_start,self.stroke_duration))
        q=u*(len(self.path)-1)
        k=min(int(q),len(self.path)-2); f=q-k
        point=[self.path[k][j]*(1-f)+self.path[k+1][j]*f for j in (0,1)]
        release=ease(progress(t,self.stroke_start+self.stroke_duration,.4))
        dx=(point[0]-self.tip[0])*(1-release)
        dy=(point[1]-self.tip[1])*(1-release)
        alpha=ease(progress(t,self.start,.2))
        image.paste(self.pixels,(self.x+round(dx*SX),self.y+round(dy*SY)),self.mask.point(lambda a:round(a*alpha)))


class ArrayLayer(Layer):
    """Keep the original array visible before any pen, stroke, or trace exists."""
    def __init__(self,*args,swapped=False,**kwargs):
        super().__init__(*args,**kwargs)
        array_source=SOURCE.copy()
        array_source.paste('white',(0,0,SOURCE.width,SOURCE.height),registered(Image.open(LAYER_ASSETS/'masks/a-compare-hand-erase.png').convert('L')))
        numbers=array_source.crop(native_box((264,481,424,549)))
        if swapped:
            # Original 3174 glyphs, reordered to 1374 after the recorded swap.
            digits=[(310,481,332,549),(264,481,310,549),(332,481,373,549),(373,481,424,549)]
            numbers=Image.new('RGB',(160,68),'white'); x=0
            for bounds in digits:
                digit=array_source.crop(native_box(bounds));numbers.paste(digit,(x,0));x+=digit.width
        self.pixels=numbers.resize(self.size,Image.Resampling.LANCZOS)


class ViewSwitchHandLayer(Layer):
    """Click the bottom index tab, then the middle param tab, bottom to top."""
    TIP=(2135,842)
    INDEX=(2035,900)
    PARAM=(2180,480)
    INDEX_CLICK_END=1.8
    PARAM_CLICK_END=4.7

    def tip_at(self,t):
        if t<.8:return self.TIP
        if t<1.45:
            u=ease(progress(t,.8,.65));a,b=self.TIP,self.INDEX
        elif t<3.2:
            return (self.INDEX[0],self.INDEX[1]+2*math.sin(math.pi*progress(t,1.45,.3))**2)
        elif t<4.35:
            u=ease(progress(t,3.2,1.15));a,b=self.INDEX,self.PARAM
        elif t<6.1:
            return (self.PARAM[0],self.PARAM[1]+2*math.sin(math.pi*progress(t,4.35,.3))**2)
        else:
            u=ease(progress(t,6.1,.75));a,b=self.PARAM,self.TIP
        return tuple(a[i]*(1-u)+b[i]*u for i in (0,1))

    def paint(self,image,t):
        tip=self.tip_at(t)
        image.paste(self.pixels,(self.x+round((tip[0]-self.TIP[0])*SX),self.y+round((tip[1]-self.TIP[1])*SY)),self.mask)


class PressDragLayer(Layer):
    """Hold the original tag, drag it UP once, then absorb it into is_bigger."""
    def offset(self, t):
        return ease(progress(t, 1.1, 1.25))

    def paint(self, image, t):
        u = self.offset(t)
        alpha = 1 - ease(progress(t, 2.4, .25))
        if not alpha: return
        press = math.sin(math.pi * progress(t, .1, .9))**2
        scale = 1 - .035*press
        w,h = self.size
        size = (round(w*scale),round(h*scale))
        pixels = self.pixels.resize(size,Image.Resampling.LANCZOS)
        mask = self.mask.resize(size,Image.Resampling.LANCZOS).point(lambda a:round(a*alpha))
        x=self.x+round(self.dx*SX*u)+(w-size[0])//2
        y=self.y+round(self.dy*SY*u)+(h-size[1])//2
        image.paste(pixels,(x,y),mask)


class RegroupCardsLayer(Layer):
    """Only after the counterexample, drag the original blue steps together."""
    def paint(self,image,t):
        u=ease(progress(t,1.9,1.25))
        alpha=1-ease(progress(t,3.15,.3))
        image.paste(self.pixels,(self.x+round(-85*SX*u),self.y+round(75*SY*u)),self.mask.point(lambda a:round(a*alpha)))


class RegroupHandLayer(Layer):
    def paint(self,image,t):
        u=ease(progress(t,1.9,1.25))*(1-ease(progress(t,3.35,.55)))
        image.paste(self.pixels,(self.x+round(-85*SX*u),self.y+round(75*SY*u)),self.mask)


class GreenWritingHandLayer(Layer):
    """Reuse the original pen hand to draw the existing green underline."""
    def clear(self,image):
        pass  # This hand is copied from b; its original position stays intact.

    def paint(self,image,t):
        if t<4.8 or t>=6.6:return
        u=ease(progress(t,5,1))
        alpha=ease(progress(t,4.8,.2))*(1-ease(progress(t,6.25,.35)))
        x=self.x+round((-98+117*u)*SX)
        y=self.y+round((316+3*u)*SY)
        image.paste(self.pixels,(x,y),self.mask.point(lambda a:round(a*alpha)))


class DragHandLayer(Layer):
    def paint(self, image, t):
        # Finger stays attached to the tag through long press and upward drop,
        # then releases and returns while the merged card unfolds below.
        u=ease(progress(t,1.1,1.25))*(1-ease(progress(t,2.5,.7)))
        press=math.sin(math.pi*progress(t,.1,.9))**2
        x=self.x+round(self.dx*SX*u)
        y=self.y+round((self.dy*u+2*press)*SY)
        image.paste(self.pixels,(x,y),self.mask)


class WritingHandLayer(Layer):
    def paint(self,image,t):
        approach=ease(progress(t,4.0,.45))
        stroke=ease(progress(t,4.5,1.5))
        release=ease(progress(t,6.15,.35))
        dx=-68*approach*(1-stroke)
        dy=-6*approach*(1-release)
        image.paste(self.pixels,(self.x+round(dx*SX),self.y+round(dy*SY)),self.mask)


class MergeLayer(Layer):
    def paint(self,image,t):
        u=ease(progress(t,self.start,self.duration))
        if not u:return
        w,h=self.size
        size=(round(w*(.75+.25*u)),round(h*(.75+.25*u)))
        pixels=self.pixels.resize(size,Image.Resampling.LANCZOS)
        mask=self.mask.resize(size,Image.Resampling.LANCZOS).point(lambda a:round(a*u))
        image.paste(pixels,(self.x+(w-size[0])//2,self.y+(h-size[1])//2),mask)


def background_column(bounds, sample_x):
    # The stacked labels overlap the tablet rim. Continue that same original
    # rim from a neighboring, unobstructed column while the labels appear.
    x0,y0,x1,y1 = box(bounds)
    result = Image.new('RGB',(x1-x0,y1-y0))
    sample = round((sample_x+OFFSET[0])*SX)
    draw = ImageDraw.Draw(result)
    for row in range(y1-y0):
        draw.line((0,row,x1-x0,row),fill=BASE.getpixel((sample,y0+row)))
    result.info['figure_bounds']=bounds
    return result


def background_row(bounds, sample_y):
    x0,y0,x1,y1=box(bounds)
    sample=round((sample_y+OFFSET[1])*SY)
    row=BASE.crop((x0,sample,x1,sample+1))
    result=row.resize((x1-x0,y1-y0),Image.Resampling.NEAREST)
    result.info['figure_bounds']=bounds
    return result


def hand_plate(bounds, tablet):
    x0,y0,x1,y1=box(bounds)
    plate=Image.new('RGB',(x1-x0,y1-y0),'white')
    for y in range(y0,y1):
        fy=y/SY-OFFSET[1]
        for x in range(x0,x1):
            fx=x/SX-OFFSET[0]
            if tablet==1:
                # Extend this tablet's original bezel segments under its hand.
                if 510<fx<590 and 125<fy<314:
                    sample_x=fx-(fy-90)*.16
                    if (sample_x<538 and fy<294) or sample_x>=538:
                        plate.putpixel((x-x0,y-y0),BASE.getpixel((round((sample_x+OFFSET[0])*SX),round((90+OFFSET[1])*SY))))
                if 280<fy<350 and 340<fx<585:
                    sample_y=fy+(fx-275)*.112
                    if 315<sample_y<355 and (sample_y>338 or fx<565):
                        pixel=BASE.getpixel((round((275+OFFSET[0])*SX),round((sample_y+OFFSET[1])*SY)))
                        if min(pixel)<220:plate.putpixel((x-x0,y-y0),pixel)
            elif tablet==2 and fy>610:
                # Continue this tablet's slanted bottom rim behind the hand.
                sample_y=fy+(fx-275)*.054
                plate.putpixel((x-x0,y-y0),BASE.getpixel((round((275+OFFSET[0])*SX),min(BASE.height-1,round((sample_y+OFFSET[1])*SY)))))
    plate.info['figure_bounds']=bounds
    return plate


# Coordinates are in the original 3285×1277 figure, including hand silhouettes.
# Each response follows its matching stroke or input; the other panels stay still.
HAND_A = [(346,171),(402,164),(437,149),(487,129),(522,136),(586,168),(645,178),(652,188),(647,202),(588,200),(600,251),(620,294),(658,333),(578,378),(552,341),(490,305),(474,274),(450,266),(443,252),(430,247),(424,235),(421,219),(408,209),(401,197),(353,188)]
HAND_COMPARE = [(332,571),(365,566),(389,554),(416,544),(439,547),(467,565),(496,568),(501,578),(494,585),(473,585),(481,621),(510,654),(469,684),(446,651),(405,629),(390,614),(379,607),(371,596),(366,588),(338,584)]
HAND_SWAP = [(400,818),(431,812),(461,796),(486,791),(510,798),(542,817),(565,820),(572,829),(567,837),(541,836),(551,872),(574,906),(521,935),(498,907),(461,884),(445,866),(439,852),(429,841),(403,830)]
HAND_LAST = [(554,1125),(580,1119),(612,1105),(635,1100),(655,1106),(682,1120),(714,1125),(721,1133),(715,1142),(696,1141),(705,1185),(726,1214),(686,1243),(662,1214),(624,1193),(606,1176),(599,1162),(589,1151),(582,1140),(556,1136)]
HAND_DONE = [(3022,368),(3038,379),(3058,403),(3096,418),(3121,449),(3144,463),(3162,512),(3201,563),(3137,596),(3107,556),(3069,530),(3056,502),(3044,482),(3030,468),(3029,451),(3013,428),(2999,409),(2997,393),(3008,378)]

BEATS = [
    [PenLayer((126,63,187,94),.5,.4),
     PenLayer((252,411,309,446),100,.4),
     PenLayer((309,411,395,446),4.25,.4),
     PenLayer((395,411,465,446),100,.4),
     PenLayer((359,735,417,767),100,.4),
     PenLayer((417,735,497,767),100,.4),
     PenLayer((497,735,570,766),7.3,.4),
     PenLayer((448,1028,509,1064),100,.4),
     PenLayer((509,1025,600,1064),10.7,.4),
     PenLayer((600,1028,665,1064),100,.4),
     Layer((140,121,302,199),1.2,1.65,'ink'),
     Layer((348,36,473,78),3.15,.45,polygon=[(348,50),(460,39),(469,42),(472,62),(466,69),(355,80),(348,76)],mask_dilation=1),
     ArrayLayer((264,481,424,549),-1,.25),
     ArrayLayer((367,810,553,875),-1,.25),
     ArrayLayer((453,1101,631,1165),-1,.25,swapped=True),
     Layer((280,548,330,570),4.95,.8,'wipe',asset='a-compare-ink'),
     Layer((473,446,648,489),5.95,.45),
     Layer((578,780,753,819),6.95,.3),
     Layer((377,781,426,815),7.95,.8,'wipe',asset='a-swap-arc'),
     Layer((381,884,449,941),8.8,.45,'ink',asset='a-swap-result'),
     Layer((579,823,752,859),9.35,.45),
     Layer((664,1075,840,1116),10.35,.25),
     Layer((665,1117,839,1155),10.35,.25),
     Layer((485,1157,546,1177),11.35,.8,'wipe',asset='a-last-ink'),
     Layer((665,1157,839,1196),12.35,.5),
     TraceHandLayer((347,129,660,380),1.0,asset='a-data-hand',polygon=HAND_A,
                    bg=hand_plate((340,122,667,387),1),
                    stroke_start=1.2,stroke_duration=1.65,tip=(351,176),
                    path=[(145,146),(175,184),(195,152),(213,183),(240,146),(256,181),(281,145),(301,175)]),
     TraceHandLayer((332,543,512,685),4.75,asset='a-compare-hand',polygon=HAND_COMPARE,neutral=True,
                    bg=hand_plate((325,536,519,692),2),
                    stroke_start=4.95,stroke_duration=.8,tip=(334,576),path=[(283,565),(304,559),(327,555)]),
     TraceHandLayer((400,790,576,937),7.75,asset='a-swap-hand',polygon=HAND_SWAP,neutral=True,
                    stroke_start=7.95,stroke_duration=.8,tip=(403,824),path=[(382,810),(382,795),(394,788),(410,793),(420,809)]),
     TraceHandLayer((554,1100,728,1244),11.15,asset='a-last-hand',sprite='a-last-hand',polygon=HAND_LAST,neutral=True,
                    stroke_start=11.35,stroke_duration=.8,tip=(555,1124),path=[(487,1166),(513,1167),(543,1169)])],
    [PressDragLayer((1370,124,1532,215),asset='swap-tag',dx=-36,dy=-72,colored=True),
     DragHandLayer((1485,126,1742,338),asset='b-drag-hand',dx=-36,dy=-72,
                   polygon=[(1490,132),(1498,127),(1513,134),(1567,166),(1582,158),(1603,164),(1621,176),(1637,174),(1656,183),(1668,206),(1683,247),(1710,270),(1741,294),(1715,338),(1695,325),(1660,305),(1625,291),(1590,271),(1573,251),(1553,229),(1546,218),(1540,210),(1530,211),(1523,201),(1521,192),(1532,188),(1538,192),(1544,200),(1511,169),(1490,149)],
                   bg=background_row((1478,119,1749,345),45)),
     MergeLayer((920,278,1490,576),2.5,.8),
     Layer((1014,651,1181,691),3.35,.5,colored=True),
     Layer((1096,812,1183,830),4.5,1.5,'wipe',bg=background_column((1096,812,1183,830),1090),colored=True,asset='b-underline'),
     Layer((1105,832,1188,897),6.15,.75,'ink',bg=background_column((1105,832,1188,897),1100),colored=True,asset='b-result'),
     Layer((1284,647,1474,687),6.35,.4,colored=True),
     Layer((1284,697,1474,737),6.85,.4,colored=True),
     Layer((1284,746,1474,787),7.35,.4,colored=True),
     WritingHandLayer((1161,710,1408,858),asset='b-writing-hand',neutral=True,polygon=[(1165,823),(1180,811),(1191,786),(1212,750),(1230,737),(1283,730),(1324,713),(1338,716),(1341,725),(1327,737),(1345,757),(1368,775),(1402,791),(1396,833),(1383,858),(1360,849),(1304,846),(1260,837),(1232,837),(1216,827),(1200,824),(1189,824),(1174,827)])],
    [# The complete bottom value view stays in BASE from the first frame.
     # Only a completed index click reveals the middle group, together.
     Layer((2011,457,2138,503),1.8,.2,bg='#fcfcfc',asset='c-index-tab'),
     Layer((1767,507,2262,596),1.95,.4,bg='#fcfcfc',asset='c-index-row1'),
     Layer((1767,599,2262,688),1.95,.4,bg='#fcfcfc',asset='c-index-row2'),
     Layer((1767,691,2262,781),1.95,.4,bg='#fcfcfc',asset='c-index-row3'),
     # Then a click on the middle param tab reveals the upper group.
     Layer((2169,23,2303,67),4.7,.2,bg='#fcfcfc',asset='c-param-tab'),
     Layer((1789,72,2311,177),4.85,.4,bg='#fcfcfc',asset='c-param-row1'),
     Layer((1789,178,2311,282),4.85,.4,bg='#fcfcfc',asset='c-param-row2'),
     Layer((1789,283,2311,381),4.85,.4,bg='#fcfcfc',asset='c-param-row3'),
     ViewSwitchHandLayer((2130,833,2376,978),asset='c-hand')],
    [Layer((2963,325,3038,373),.45,.85,'tap',asset='d-done'),
     Layer((2996,367,3203,599),.45,.85,'hand',asset='d-hand',polygon=HAND_DONE,dx=-7,dy=-9),
     Layer((2590,456,2770,635),1.55,.55,asset='d-input-original'),
     Layer((2772,456,2945,635),2.25,.55,asset='d-input-counterexample'),
     Layer((2893,523,2932,587),2.65,.65,'ink',asset='d-counterexample-ink'),
     # Replay input is introduced only after the middle counterexample.
     Layer((2505,930,2736,1041),3.4,.4,asset='d-array'),
     Layer((2778,764,3223,841),3.95,.45,asset='d-replay-row1'),
     Layer((2778,841,3223,924),4.5,.45,asset='d-replay-row2'),
     Layer((2778,924,3223,998),5.05,.45,asset='d-replay-row3'),
     Layer((2777,998,2918,1106),6.3,.45,asset='d-final-preview'),
     Layer((2920,987,3220,1064),5.85,.6,asset='d-result')],
    [Layer((1787,1213,2258,1266),.25,1.4,'arrow'),
     RegroupCardsLayer((1341,854,1495,970),asset='blue-stack',bg=background_column((1341,854,1495,970),1300),colored=True),
     RegroupHandLayer((1498,925,1688,1093),asset='refine-drag-hand',polygon=[(1505,949),(1535,938),(1562,928),(1590,934),(1638,944),(1652,967),(1669,1020),(1684,1050),(1660,1090),(1624,1070),(1609,1049),(1567,1030),(1542,1009),(1515,992),(1503,976),(1510,968),(1526,974),(1547,981),(1566,984),(1575,967),(1561,958),(1538,962),(1511,962)]),
     MergeLayer((1275,996,1525,1180),3.35,.8),
     Layer((1094,999,1213,1033),4.2,.5),
     Layer((1063,1133,1190,1150),5,1,'wipe',bg=background_column((1063,1133,1190,1150),1050),colored=True,asset='refine-underline'),
     Layer((1065,1150,1191,1221),6.15,.9,'ink',bg=background_column((1065,1150,1191,1221),1060),colored=True,asset='refine-result'),
     Layer((1278,1184,1520,1226),7.25,.65),
     GreenWritingHandLayer((1161,710,1408,858),asset='b-writing-hand',neutral=True,polygon=[(1165,823),(1180,811),(1191,786),(1212,750),(1230,737),(1283,730),(1324,713),(1338,716),(1341,725),(1327,737),(1345,757),(1368,775),(1402,791),(1396,833),(1383,858),(1360,849),(1304,846),(1260,837),(1232,837),(1216,827),(1200,824),(1189,824),(1174,827)])]
]


# A UI crop can overlap a native hand (for example the pen over a blue trace
# card). Exclude that silhouette from both reveal and erase masks, so a card
# never reintroduces fingers, pencil fragments, or neighboring handwriting.
source_hands = Image.new('L', BASE.size)
for name in ('a-data-hand','a-compare-hand','a-swap-hand','a-last-hand',
             'b-writing-hand','b-drag-hand','c-hand','d-hand','refine-drag-hand'):
    native=Image.open(LAYER_ASSETS/'masks'/f'{name}.png').convert('L')
    source_hands=ImageChops.lighter(source_hands,registered(native).resize(BASE.size,Image.Resampling.LANCZOS))
for beat in BEATS:
    for layer in beat:
        if isinstance(layer,(TraceHandLayer,DragHandLayer,WritingHandLayer,RegroupHandLayer,GreenWritingHandLayer,ViewSwitchHandLayer,ArrayLayer,PenLayer)) or layer.kind=='hand':continue
        layer.mask=ImageChops.subtract(layer.mask,source_hands.crop(layer.bounds))

red_ink=next(x for x in BEATS[3] if x.asset=='d-counterexample-ink')
red_mask=Image.new('L',BASE.size)
red_mask.paste(red_ink.mask,(red_ink.x,red_ink.y))
red_card=next(x for x in BEATS[3] if x.asset=='d-input-counterexample')
red_card.mask=ImageChops.subtract(red_card.mask,red_mask.crop(red_card.bounds))


def render_source(beat, t):
    # Settling is exact: the final half-second is the untouched source image.
    settle=13.35 if beat is BEATS[0] else 9.35 if beat is BEATS[1] or beat is BEATS[4] else 7.35
    if t >= settle:
        return BASE.copy()
    image = BASE.copy()
    for layer in beat:
        layer.clear(image)
    for layer in beat:
        layer.paint(image, t)
    return Image.blend(image,BASE,ease(progress(t,settle-.35,.35)))


def render(beat, t):
    return render_source(beat,source_time(next(i for i,b in enumerate(BEATS) if b is beat),t))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--preview', action='store_true')
    parser.add_argument('--beat',type=int,choices=range(1,6))
    args = parser.parse_args()
    for n,beat in enumerate(BEATS,1):
        if args.beat and n!=args.beat: continue
        if args.preview:
            # Original-element keyframes, cropped to the narrated panel.
            crop = [(0,0,880,1277),(795,0,1662,1277),(1700,0,2390,1195),(2405,0,3285,1277),(950,835,2290,1310)][n-1]
            times=((0,1.65,2.7,3.22,4.85,5.7,6.7,7.5),
                   (.35,.8,1.9,3.3,4.4,5.65),
                   (0,.7,1.4,2.35,3,4.6),
                   (.3,1.7,2.7,4.2),
                   (.3,.95,2.25,3.7,4.6,5.65))[n-1]
            panels = [render(beat,t).crop(box(crop)) for t in times]
            sheet = Image.new('RGB',(panels[0].width*len(panels),panels[0].height),'#fff')
            for i,p in enumerate(panels): sheet.paste(p,(i*p.width,0))
            out = Path('/tmp') / f'overview-native-{n}.png'
            sheet.save(out)
        else:
            out=ROOT / f'media/overview-{n}.mp4'
            proc=subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{SIZE[0]}x{SIZE[1]}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(out)],stdin=subprocess.PIPE)
            for frame in range(FPS*DURATIONS[n-1]):
                proc.stdin.write(render(beat,frame/FPS).tobytes())
            proc.stdin.close()
            if proc.wait(): raise RuntimeError(f'ffmpeg failed: {out}')
        print(out.name,flush=True)


if __name__ == '__main__': main()
