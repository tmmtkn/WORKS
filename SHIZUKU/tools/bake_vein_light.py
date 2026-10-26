"""Bake image-aligned wet-light frames; needs Pillow and numpy, never runs in browser."""
from pathlib import Path
import heapq, json, re
import numpy as np
from PIL import Image, ImageFilter
ROOT=Path(__file__).resolve().parents[1]
photo=Image.open(ROOT/'assets/leaf.png').convert('L').resize((768,512),Image.Resampling.LANCZOS)
gray=np.asarray(photo,dtype=np.float32)/255
ridge=np.zeros_like(gray)
freq_y=np.fft.fftfreq(gray.shape[0])[:,None];freq_x=np.fft.fftfreq(gray.shape[1])[None,:]
spectrum=np.fft.fft2(gray)
for sigma in (2.8,4.8,7.0):
 b=np.fft.ifft2(spectrum*np.exp(-2*np.pi*np.pi*sigma*sigma*(freq_x*freq_x+freq_y*freq_y))).real
 gy,gx=np.gradient(b); hyy,hyx=np.gradient(gy);hxy,hxx=np.gradient(gx)
 hxx*=sigma*sigma;hyy*=sigma*sigma;hxy=(hxy+hyx)*.5*sigma*sigma
 gap=np.sqrt((hxx-hyy)**2+4*hxy*hxy)
 l1=(hxx+hyy-gap)*.5;l2=(hxx+hyy+gap)*.5
 swap=np.abs(l1)>np.abs(l2);small=np.where(swap,l2,l1);large=np.where(swap,l1,l2)
 ratio=np.abs(small)/(np.abs(large)+1e-6)
 strength=np.sqrt(small*small+large*large)
 v=np.exp(-ratio*ratio/.18)*(1-np.exp(-strength*strength/.0032))
 v[large>=0]=0;ridge=np.maximum(ridge,v)
# Retain image pixels only: no invented centerlines or animated bends.
ridge=np.clip((ridge-.13)/.55,0,1)**.85
source=(ROOT/'app.js').read_text();coords=json.loads(re.search(r'const coords=(\[.*?\]);',source).group(1))
yy,xx=np.mgrid[:512,:768];drop_mask=np.ones_like(ridge)
for x,y,r in coords:
 dist=np.hypot(xx-x*.5,yy-y*.5)
 drop_mask*=np.clip((dist-r*.5*.9)/(max(3,r*.16)),0,1)
ridge*=drop_mask
mask=Image.fromarray(np.uint8(ridge*255),'L')
# Diagnostic overlay is kept outside the distributable assets.
overlay=Image.open(ROOT/'assets/leaf.png').convert('RGB').resize((768,512))
color=Image.new('RGB',overlay.size,(170,235,205));overlay=Image.composite(color,overlay,mask.point(lambda a:int(a*.6)))
overlay.save('/private/tmp/shizuku-vein-alignment.png')
N=128;FRAMES=8;RADIUS=260
atlas=Image.new('RGBA',(N*FRAMES,N*len(coords)),(0,0,0,0))
for index,(sx,sy,sr) in enumerate(coords):
 x0=int(sx/2-RADIUS/2);y0=int(sy/2-RADIUS/2);side=RADIUS
 local=np.asarray(mask.crop((x0,y0,x0+side,y0+side)),dtype=np.float32)/255
 cost=1/(.12+local*2.8)
 distance=np.full((side,side),np.inf);cx=cy=side//2
 # A drop emits from its rim, avoiding a false bright bridge through the water.
 rad=max(3,int(sr/2));heap=[]
 for theta in np.linspace(0,2*np.pi,48):
  x=int(cx+rad*np.cos(theta));y=int(cy+rad*np.sin(theta))
  if 0<=x<side and 0<=y<side:distance[y,x]=0;heapq.heappush(heap,(0,y,x))
 while heap:
  d,y,x=heapq.heappop(heap)
  if d!=distance[y,x] or d>520:continue
  for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
   ny=y+dy;nx=x+dx
   if 0<=nx<side and 0<=ny<side:
    nd=d+(float(cost[y,x])+float(cost[ny,nx]))*.5
    if nd<distance[ny,nx]:distance[ny,nx]=nd;heapq.heappush(heap,(nd,ny,nx))
 py,px=np.mgrid[:side,:side];spatial=np.clip(1-np.hypot(px-cx,py-cy)/(side*.47),0,1)**1.1
 for frame in range(FRAMES):
  limit=35+frame*63
  reveal=np.clip((limit-distance)/32,0,1)
  ink=np.uint8(np.clip(local*spatial*reveal,0,1)*255)
  sharp=Image.fromarray(ink,'L').resize((N,N),Image.Resampling.LANCZOS)
  glow=sharp.filter(ImageFilter.GaussianBlur(1.7))
  alpha=np.maximum(np.asarray(sharp)*.68,np.asarray(glow)*1.55).clip(0,255).astype('uint8')
  tile=Image.new('RGBA',(N,N),(212,232,219,0));tile.putalpha(Image.fromarray(alpha,'L'))
  atlas.paste(tile,(frame*N,index*N))
atlas.save(ROOT/'assets/vein-light.webp',lossless=True,method=6)
print('Baked',len(coords),'drops,',FRAMES,'frames; atlas:',atlas.size)
