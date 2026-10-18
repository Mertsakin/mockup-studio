// Builds the Shotlight brand files into brand/: node tools/brand/build.mjs
//   shotlight-icon.svg / -small.svg        the mark (mark.mjs): large drawing (64 px and up), small drawing (48 px and below)
//   shotlight-icon-{1024,512,192,180,64}.png   large drawing (180: apple-touch-icon)
//   shotlight-icon-{48,32,16}.png, favicon.ico small drawing (the .ico holds 16, 32 and 48 as PNG entries)
//   shotlight-wordmark-{on-light,on-dark}.svg/.png   mark + "shotlight" in Inter Tight SemiBold, outlined (no font needed)
//   shotlight-text-{on-light,on-dark}.svg   the word alone
// The word is outlined with opentype.js from tools/brand/InterTight-SemiBold.ttf (OFL), tracking -0.03 em, kerning on.
// PNGs are rendered by headless Chromium (Playwright), transparent.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import opentype from 'opentype.js';
import {chromium} from 'playwright';
import {icon} from './mark.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'..','..'),OUT=path.join(ROOT,'brand');
const INK={'on-light':'#141416','on-dark':'#f4f4f5'};
fs.mkdirSync(OUT,{recursive:true});
const write=(name,data)=>{fs.writeFileSync(path.join(OUT,name),data);return name;};

// ---------- the word as outlines
const font=opentype.loadSync(path.join(HERE,'InterTight-SemiBold.ttf'));
const SIZE=100,TRACK=-.03*SIZE;
function word(text){
  const glyphs=font.stringToGlyphs(text),scale=SIZE/font.unitsPerEm;let x=0,d='';
  glyphs.forEach((g,i)=>{d+=g.getPath(x,0,SIZE).toPathData(2);x+=g.advanceWidth*scale+TRACK;
    if(i<glyphs.length-1)x+=font.getKerningValue(g,glyphs[i+1])*scale;});
  const bb=new opentype.Path();bb.commands=font.getPath(text,0,0,SIZE).commands;  // only for the vertical extent
  const b=bb.getBoundingBox();
  return {d,width:x-TRACK,top:b.y1,bottom:b.y2};
}
const W=word('shotlight'),CAP=font.tables.os2.sCapHeight/font.unitsPerEm*SIZE;

// ---------- files
const files=[];
// the files carry a real size (no width / height: viewers draw a 100 x 100 px image and enlarge it)
const sized=(svg,px)=>svg.replace('<svg xmlns="http://www.w3.org/2000/svg" ',`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" `);
files.push(write('shotlight-icon.svg',sized(icon({id:'a'}),1024)));
files.push(write('shotlight-icon-small.svg',sized(icon({small:true,id:'b'}),48)));
for(const k of ['on-light','on-dark']){
  // the word alone: from the top of the ascenders to the bottom of the descender (g)
  const h=W.bottom-W.top;
  files.push(write(`shotlight-text-${k}.svg`,`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${W.top.toFixed(2)} ${W.width.toFixed(2)} ${h.toFixed(2)}"><path fill="${INK[k]}" d="${W.d}"/></svg>`));
  // mark + word: the mark is 1.54 em (as in the design sheet), centred on the capital height, 0.46 em apart
  const S=1.54*SIZE,gap=.46*SIZE,iy=-CAP/2-S/2,y0=Math.min(iy,W.top),y1=Math.max(iy+S,W.bottom);
  const mark=icon({id:'w'+k.slice(3)}).replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">',`<svg x="0" y="${iy.toFixed(2)}" width="${S}" height="${S}" viewBox="0 0 100 100">`);
  files.push(write(`shotlight-wordmark-${k}.svg`,`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${y0.toFixed(2)} ${(S+gap+W.width).toFixed(2)} ${(y1-y0).toFixed(2)}">${mark}<path transform="translate(${S+gap} 0)" fill="${INK[k]}" d="${W.d}"/></svg>`));
}

// ---------- PNGs and the favicon
const browser=await chromium.launch();
const page=await browser.newPage();
async function png(svgName,w,h){
  const svg=fs.readFileSync(path.join(OUT,svgName),'utf8');
  const b64=await page.evaluate(async({svg,w,h})=>{
    const img=new Image();img.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg)));await img.decode();
    const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);
    return c.toDataURL('image/png').split(',')[1];},{svg,w,h});
  return Buffer.from(b64,'base64');
}
for(const s of [1024,512,192,180,64])files.push(write(`shotlight-icon-${s}.png`,await png('shotlight-icon.svg',s,s)));
const small={};
for(const s of [48,32,16]){small[s]=await png('shotlight-icon-small.svg',s,s);files.push(write(`shotlight-icon-${s}.png`,small[s]));}
for(const k of ['on-light','on-dark']){
  const svg=fs.readFileSync(path.join(OUT,`shotlight-wordmark-${k}.svg`),'utf8'),[,,vw,vh]=/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg).slice(1).map(Number);
  const H=120,Wd=Math.round(vw/vh*H);files.push(write(`shotlight-wordmark-${k}.png`,await png(`shotlight-wordmark-${k}.svg`,Wd,H)));
}
await browser.close();
// ICO with PNG entries (Vista+ and every browser read them)
{const sizes=[16,32,48],head=Buffer.alloc(6+16*sizes.length);head.writeUInt16LE(0,0);head.writeUInt16LE(1,2);head.writeUInt16LE(sizes.length,4);
  let off=head.length;sizes.forEach((s,i)=>{const e=6+16*i,b=small[s];head.writeUInt8(s,e);head.writeUInt8(s,e+1);head.writeUInt8(0,e+2);head.writeUInt8(0,e+3);
    head.writeUInt16LE(1,e+4);head.writeUInt16LE(32,e+6);head.writeUInt32LE(b.length,e+8);head.writeUInt32LE(off,e+12);off+=b.length;});
  files.push(write('favicon.ico',Buffer.concat([head,...sizes.map(s=>small[s])])));}
// the studio's own favicon (public/: Vite serves and copies it as it is; index.html links it)
fs.copyFileSync(path.join(OUT,'favicon.ico'),path.join(ROOT,'public/favicon.ico'));
fs.copyFileSync(path.join(OUT,'shotlight-icon-small.svg'),path.join(ROOT,'public/favicon.svg'));
console.log('brand/:',files.join(', '),'+ public/favicon.ico, public/favicon.svg');
