import {tex} from './materials.js';
import {RT} from './rt.js';
import {MAX_TEX,req} from '../render/renderer.js';
import {THEMES} from '../state/constants.js';
import {mkCanvas,roundRect} from '../util.js';

function updateChrome(d){
  const o=RT.get(d.id);if(!o||d.type!=='browser')return;
  const t=THEMES[d.theme]||THEMES.light,cw=4096,ch=Math.round(cw*o.chromeBar/o.chromeW),c=mkCanvas(cw,ch),g=c.getContext('2d');
  g.fillStyle=t.bar;g.fillRect(0,0,cw,ch);g.fillStyle=t.line;g.fillRect(0,ch-3,cw,3);
  const r=ch*.11;g.fillStyle=t.dot;
  for(let i=0;i<3;i++){g.beginPath();g.arc(ch*.6+i*r*3.2,ch/2,r,0,Math.PI*2);g.fill();}
  const pw=cw*.5,ph=ch*.56,px=(cw-pw)/2,py=(ch-ph)/2;g.fillStyle=t.pill;roundRect(g,px,py,pw,ph,ph/2);g.fill();
  const lx=px+ph*.6,ly=ch/2+ch*.03;g.strokeStyle=t.text;g.lineWidth=ch*.03;
  g.beginPath();g.arc(lx,ly-ch*.07,ch*.065,Math.PI,0);g.stroke();
  g.fillStyle=t.text;roundRect(g,lx-ch*.095,ly-ch*.07,ch*.19,ch*.15,ch*.03);g.fill();
  g.font='500 '+(ch*.26)+'px "Instrument Sans", system-ui, sans-serif';g.textBaseline='middle';g.textAlign='left';
  g.fillText(d.url||'',px+ph*1.0,ch/2+ch*.01,pw-ph*1.4);
  if(o.mats.chrome.map)o.mats.chrome.map.dispose();
  o.mats.chrome.map=tex(c);o.mats.chrome.needsUpdate=true;req();
}
/* ---------- screen textures ---------- */
function drawPlaceholder(g,x,y,w,h){
  const gr=g.createLinearGradient(x,y,x+w,y+h);gr.addColorStop(0,'#3647d9');gr.addColorStop(1,'#9b5de5');
  g.fillStyle=gr;g.fillRect(x,y,w,h);
  const s=Math.min(w,h);g.textAlign='center';g.textBaseline='middle';
  g.fillStyle='rgba(255,255,255,.94)';g.font='600 '+(s*.068)+'px "Instrument Sans", system-ui, sans-serif';
  g.fillText('Ekran görüntünü ekle',x+w/2,y+h/2-s*.04);
  g.fillStyle='rgba(255,255,255,.72)';g.font='400 '+(s*.042)+'px "Instrument Sans", system-ui, sans-serif';
  g.fillText('Görsel seç ya da sürükle bırak',x+w/2,y+h/2+s*.05);
}
// scroll (0..1): for an image taller than the screen ("Doldur"), how far down the visible window sits
function drawFit(g,img,x,y,w,h,fit,scroll=0){
  const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height;
  g.save();g.beginPath();g.rect(x,y,w,h);g.clip();g.imageSmoothingQuality='high';
  if(fit==='stretch')g.drawImage(img,x,y,w,h);
  else{const s=fit==='cover'?Math.max(w/iw,h/ih):Math.min(w/iw,h/ih),dw=iw*s,dh=ih*s,dy=dh>h?-(dh-h)*scroll:(h-dh)/2;g.drawImage(img,x+(w-dw)/2,y+dy,dw,dh);}
  g.restore();
}
// Display size of the device's screen canvas (landscape phones / tablets swap it)
function screenSize(o,d){
  // 4096 px on the long edge (or the GPU's limit): sharp at 4K export, screenshots are rarely larger
  const geomA=o.sw/o.sh,land=o.rotatable&&d.landscape,dispA=land?1/geomA:geomA,long=Math.min(4096,MAX_TEX);
  return dispA>=1?[long,Math.round(long/dispA)]:[Math.round(long*dispA),long];
}
// How many screens tall the screenshot is (0 when it cannot scroll: no image, not "Doldur", or not taller)
function scrollScreens(d){
  const o=RT.get(d.id);if(!o||!d.img||d.fit!=='cover')return 0;
  const iw=d.img.naturalWidth||d.img.width,ih=d.img.naturalHeight||d.img.height;
  let w,h;if(o.custom){if(!d.screenRect||!d.frameImg)return 0;w=d.screenRect.w*d.frameImg.naturalWidth;h=d.screenRect.h*d.frameImg.naturalHeight;}else[w,h]=screenSize(o,d);
  const n=(ih/iw)/(h/w);return n>1.01?n:0;
}
// Redraws scrolled screens at most once per frame
const pending=new Set();let raf=0;
function scrollScreen(d,frac){
  d.scroll=Math.min(1,Math.max(0,frac));pending.add(d);
  if(!raf)raf=requestAnimationFrame(()=>{raf=0;pending.forEach(setScreenTexture);pending.clear();});
}
function customCanvas(d){
  const fi=d.frameImg;
  if(!fi){
    const c=mkCanvas(900,1600),g=c.getContext('2d');
    g.fillStyle='rgba(120,128,140,.16)';roundRect(g,10,10,880,1580,90);g.fill();
    g.setLineDash([24,16]);g.lineWidth=6;g.strokeStyle='rgba(120,128,140,.75)';g.stroke();
    g.fillStyle='#6b7380';g.textAlign='center';g.textBaseline='middle';
    g.font='600 58px "Instrument Sans", system-ui, sans-serif';g.fillText('Çerçeve PNG\u2019si yükle',450,760);
    g.font='400 36px "Instrument Sans", system-ui, sans-serif';g.fillText('Ekran alanı şeffaf olmalı',450,840);
    return c;
  }
  const iw=fi.naturalWidth,ih=fi.naturalHeight,s=Math.min(1,3072/Math.max(iw,ih)),cw=Math.round(iw*s),ch=Math.round(ih*s);
  const c=mkCanvas(cw,ch),g=c.getContext('2d'),r=d.screenRect;
  if(r){const x=r.x*cw,y=r.y*ch,w=r.w*cw,h=r.h*ch;g.fillStyle=d.screenBg;g.fillRect(x,y,w,h);
    if(d.img)drawFit(g,d.img,x,y,w,h,d.fit,d.scroll);else drawPlaceholder(g,x,y,w,h);}
  g.drawImage(fi,0,0,cw,ch);return c;
}
function setScreenTexture(d){
  const o=RT.get(d.id);if(!o)return;
  if(o.custom){
    const t=tex(customCanvas(d));
    if(o.mats.custom.map)o.mats.custom.map.dispose();
    o.mats.custom.map=t;o.mats.custom.needsUpdate=true;
    o.screen.customDepthMaterial.map=t;o.screen.customDepthMaterial.needsUpdate=true;req();return;
  }
  const land=o.rotatable&&d.landscape,[cw,ch]=screenSize(o,d),old=o.mats.screen.map;
  // same size as before (e.g. scrolling): redraw into the existing canvas and texture instead of reallocating
  const reuse=old&&old.image&&old.image.width===cw&&old.image.height===ch&&old.userData.land===land;
  const c=reuse?old.image:mkCanvas(cw,ch),g=c.getContext('2d');
  if(d.img){g.fillStyle=d.screenBg;g.fillRect(0,0,cw,ch);drawFit(g,d.img,0,0,cw,ch,d.fit,d.scroll);}
  else drawPlaceholder(g,0,0,cw,ch);
  if(reuse){old.needsUpdate=true;req();return;}
  const t=tex(c);t.center.set(.5,.5);t.rotation=land?-Math.PI/2:0;t.userData.land=land;
  if(old)old.dispose();
  o.mats.screen.map=t;o.mats.screen.needsUpdate=true;req();
}
function detectScreen(img){
  const iw=img.naturalWidth,ih=img.naturalHeight,s=Math.min(1,700/Math.max(iw,ih));
  const w=Math.max(2,Math.round(iw*s)),h=Math.max(2,Math.round(ih*s));
  const c=mkCanvas(w,h),g=c.getContext('2d');g.drawImage(img,0,0,w,h);
  const a=g.getImageData(0,0,w,h).data,tr=i=>a[i*4+3]<128;
  const start=Math.floor(h/2)*w+Math.floor(w/2);if(!tr(start))return null;
  const seen=new Uint8Array(w*h),stack=[start];seen[start]=1;
  let minX=w,minY=h,maxX=0,maxY=0,touches=false;
  while(stack.length){
    const i=stack.pop(),x=i%w,y=(i-x)/w;
    if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
    if(x===0||y===0||x===w-1||y===h-1){touches=true;break;}
    const nb=[i-1,i+1,i-w,i+w];
    for(const n of nb){if(!seen[n]&&tr(n)){seen[n]=1;stack.push(n);}}
  }
  if(touches)return null;
  const x0=Math.max(0,(minX-1)/w),y0=Math.max(0,(minY-1)/h);
  return {x:x0,y:y0,w:Math.min(1-x0,(maxX-minX+3)/w),h:Math.min(1-y0,(maxY-minY+3)/h)};
}

export {detectScreen,scrollScreen,scrollScreens,setScreenTexture,updateChrome};
