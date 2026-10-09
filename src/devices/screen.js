import {tex} from './materials.js';
import {RT} from './rt.js';
import {req} from '../render/renderer.js';
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
function drawFit(g,img,x,y,w,h,fit){
  const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height;
  g.save();g.beginPath();g.rect(x,y,w,h);g.clip();g.imageSmoothingQuality='high';
  if(fit==='stretch')g.drawImage(img,x,y,w,h);
  else{const s=fit==='cover'?Math.max(w/iw,h/ih):Math.min(w/iw,h/ih),dw=iw*s,dh=ih*s,dy=dh>h?0:(h-dh)/2;g.drawImage(img,x+(w-dw)/2,y+dy,dw,dh);}
  g.restore();
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
    if(d.img)drawFit(g,d.img,x,y,w,h,d.fit);else drawPlaceholder(g,x,y,w,h);}
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
  const geomA=o.sw/o.sh,land=o.rotatable&&d.landscape,dispA=land?1/geomA:geomA,long=2560;
  let cw,ch;if(dispA>=1){cw=long;ch=Math.round(long/dispA);}else{ch=long;cw=Math.round(long*dispA);}
  const c=mkCanvas(cw,ch),g=c.getContext('2d');
  if(d.img){g.fillStyle=d.screenBg;g.fillRect(0,0,cw,ch);drawFit(g,d.img,0,0,cw,ch,d.fit);}
  else drawPlaceholder(g,0,0,cw,ch);
  const t=tex(c);t.center.set(.5,.5);t.rotation=land?-Math.PI/2:0;
  if(o.mats.screen.map)o.mats.screen.map.dispose();
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

export {detectScreen,setScreenTexture,updateChrome};
