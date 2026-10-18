"""Extract only the original operation ink; estimate its local paper backdrop.
No glyphs or paths are synthesized. UI/hand pixels stay outside these masks.
"""
from pathlib import Path
from PIL import Image,ImageChops,ImageFilter
ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'assets/overview-layers'
SOURCE=Image.open(ROOT/'assets/overview_new.png').convert('RGB')
INKS={
 'a-compare-ink':((280,548,330,570),'orange'),
 'a-swap-arc':((377,781,426,815),'magenta'),
 'a-swap-result':((381,884,449,941),'magenta'),
 'a-last-ink':((485,1157,546,1177),'orange'),
 'b-underline':((1096,812,1183,830),'blue'),
 'b-result':((1105,832,1188,897),'blue'),
 'refine-underline':((1063,1133,1190,1150),'green'),
 'refine-result':((1065,1150,1191,1221),'green'),
 'd-counterexample-ink':((2893,523,2932,587),'red'),
}

def is_ink(rgb,hue):
 r,g,b=rgb
 return {'orange':r-g>3 and g-b>3,'magenta':r-g>3 and b-g>3,'blue':b-r>3 and b-g>3,'green':g-r>3 and g-b>3,'red':r-g>4 and r-b>4}[hue]

for name,(bounds,hue) in INKS.items():
 mask=Image.new('L',SOURCE.size)
 for y in range(bounds[1],bounds[3]):
  for x in range(bounds[0],bounds[2]):
   if is_ink(SOURCE.getpixel((x,y)),hue):mask.putpixel((x,y),255)
 erase=mask.filter(ImageFilter.MaxFilter(5))
 bbox=erase.getbbox()
 if not bbox:raise ValueError(name)
 patch=SOURCE.crop(bbox)
 for y in range(bbox[1],bbox[3]):
  for x in range(bbox[0],bbox[2]):
   if not erase.getpixel((x,y)):continue
   # Interpolate the original neutral paper/shadow either side of the ink.
   left,right=x-1,x+1
   while left>bounds[0]-20:
    p=SOURCE.getpixel((left,y))
    if not erase.getpixel((left,y)) and min(p)>180 and max(p)-min(p)<8:break
    left-=1
   while right<bounds[2]+20:
    p=SOURCE.getpixel((right,y))
    if not erase.getpixel((right,y)) and min(p)>180 and max(p)-min(p)<8:break
    right+=1
   a=SOURCE.getpixel((left,y));b=SOURCE.getpixel((right,y));u=(x-left)/max(1,right-left)
   patch.putpixel((x-bbox[0],y-bbox[1]),tuple(round(a[i]*(1-u)+b[i]*u) for i in range(3)))
 (ASSETS/'backgrounds').mkdir(parents=True,exist_ok=True)
 mask.save(ASSETS/'masks'/f'{name}.png')
 erase.save(ASSETS/'masks'/f'{name}-erase.png')
 patch.save(ASSETS/'backgrounds'/f'{name}.png')
 print(name,bbox)
