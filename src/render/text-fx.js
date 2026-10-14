import {EASE} from '../state/anim.js';
import {REF,charsOf,drawText,lineOrigin,textLayout,textStyle} from './text.js';

/* Text effects (Sıradaki yol 2), in the spirit of GSAP's SplitText / ScrambleText / TextPlugin but written here: every
   frame is a pure function of the time, so the live view, scrubbing and the video export (one call per frame) agree,
   and nothing depends on DOM timelines.
   it.fx = {in, out, loop}:
   - in / out: {type, t (start, s), dur (s), split ('chars' | 'words' | 'lines'), stagger (0 = together .. 1 = one after
     another), order ('start' | 'end' | 'center' | 'random'), ease (state/anim.js EASE), chars (scramble set),
     cursor (typewriter)}. An entrance goes from the effect's "from" state to the text; an exit goes back to it (with
     the ease mirrored). Before an entrance starts the text is in the "from" state (usually invisible), after an exit
     it stays there.
   - loop: {type ('wave' | 'pulse' | 'jitter'), amp (0..1), speed (cycles / s)}: runs over the whole timeline.
   Every glyph is drawn on its own (charsOf: prefix-measured positions keep kerning and letter spacing); words and lines
   move as groups around their own centre. With no time (Tasarla, still image) the text draws settled (drawText). */
const FX={
  fade:{n:'Solarak gel',split:'words',ease:'out',from:{a:0}},
  rise:{n:'Alttan yüksel',split:'words',ease:'out',from:{a:0,dy:.8}},
  mask:{n:'Maskeli yüksel',split:'lines',ease:'expo',from:{dy:1.25},mask:true},
  slide:{n:'Kayarak gel',split:'chars',ease:'out',from:{a:0,dx:-.6}},
  pop:{n:'Büyüyerek belir',split:'words',ease:'back',from:{a:0,s:0}},
  blur:{n:'Bulanıktan net',split:'chars',ease:'out',from:{a:0,blur:.3,s:1.15}},
  drop:{n:'Düşen kelimeler',split:'words',ease:'bounce',from:{a:0,dy:-1.6,rot:25}},  // rot: random within ±rot°
  flip:{n:'3B çevir',split:'chars',ease:'back',from:{a:0,sy:0,dy:.3}},
  typewriter:{n:'Daktilo',special:true},
  scramble:{n:'Karıştır',special:true},
  counter:{n:'Sayaç',special:true,inOnly:true}
};
const LOOPS={wave:'Dalga',pulse:'Nabız',jitter:'Titreşim'};
const SPLITS={chars:'Harf',words:'Kelime',lines:'Satır'};
const ORDERS={start:'Baştan',end:'Sondan',center:'Ortadan',random:'Rastgele'};
const CHARSETS={auto:'Metne uygun',upper:'Büyük harf',lower:'Küçük harf',digits:'Rakam',symbols:'Simge'};
const SETS={upper:'ABCDEFGHIJKLMNOPRSTUVYZÇĞİÖŞÜ',lower:'abcdefghijklmnoprstuvyzçğıöşü',digits:'0123456789',symbols:'!<>-_\\/[]{}=+*^?#%&@'};
const FX_EASES={out:'Yumuşak',expo:'Hızlı başla',back:'Geri tepme',elastic:'Elastik',bounce:'Zıplama',linear:'Doğrusal'};

const clamp01=x=>x<0?0:x>1?1:x;
// deterministic noise in [0, 1) from three integers (scramble glyphs, random order, drop angles)
function rnd(a,b,c){
  let h=Math.imul(a^0x9e3779b9,0x85ebca6b)^Math.imul((b|0)+0x632be5ab,0xc2b2ae35)^Math.imul(c|0,0x27d4eb2f);
  h^=h>>>15;h=Math.imul(h,0x2c1b3c6d);h^=h>>>12;h=Math.imul(h,0x297a2d39);h^=h>>>15;return (h>>>0)/4294967296;
}
const active=it=>!!(it.fx&&(it.fx.in||it.fx.out||it.fx.loop));
// the in / out effect in charge at time t (null: settled, no exit yet)
function phaseAt(fx,t){if(fx.out&&t>=fx.out.t)return {f:fx.out,out:true};if(fx.in)return {f:fx.in,out:false};return null;}

// default overlap per split: glyphs overlap a lot (GSAP's ~0.04 s char staggers), lines barely
const STAGGER={chars:.12,words:.3,lines:.4};
/* a new effect of a type with its defaults; n = number of glyphs (the length-based durations) */
function newFx(type,n){
  const d=FX[type],len=n||12;
  const dur=type==='typewriter'?Math.min(4,Math.max(.6,len*.05)):type==='scramble'?Math.min(3,Math.max(.8,len*.07)):type==='counter'?1.6:1.2;
  const split=d.split||'chars';
  return {type,t:0,dur:+dur.toFixed(2),split,stagger:STAGGER[split],order:'start',ease:d.ease||'out',chars:'auto',cursor:true};
}
// extra room around the block for moving glyphs (fraction of the font size)
function fxPad(it){
  if(!active(it))return 0;
  const big=['rise','mask','slide','drop','flip'],fx=it.fx;
  return Math.max(fx.loop?.4:0,...['in','out'].map(k=>fx[k]?(big.includes(fx[k].type)?1.8:.5):0));
}

/* ---------- group timing: n groups share the effect's duration; stagger 0 = together, 1 = one after another */
function orderIndex(i,n,order,seed){
  if(order==='end')return {v:n-1-i,N:n};
  if(order==='center')return {v:Math.abs(i-(n-1)/2),N:(n-1)/2+1};
  if(order==='random'){
    // rank of the group's noise among all groups (a stable shuffle per item)
    const r=rnd(i,3,seed);let v=0;for(let j=0;j<n;j++)if(rnd(j,3,seed)<r)v++;return {v,N:n};
  }
  return {v:i,N:n};
}
function groupP(f,v,N,t){
  const s=clamp01(f.stagger??.5),u=f.dur/(1+Math.max(0,N-1)*s);
  return clamp01((t-f.t-v*s*u)/Math.max(1e-6,u));
}
// the glyph group's state: alpha, offsets (font sizes), scale, vertical scale, rotation (deg), blur (font sizes)
function groupState(f,def,p,out,gi,seed){
  const from=def.from,ease=EASE[f.ease]||EASE.out;
  // entrance: from -> settled along the ease; exit: settled -> from along the mirrored ease
  // k: how far the group is towards the "from" state (1 = there); alpha arrives a bit early (it reads as the motion's start)
  const e=out?1-ease(1-p):ease(p),k=out?e:1-e,fa=from.a??1;
  const ka=f.type==='fade'?k:out?1-EASE.out(clamp01((1-p)*1.6)):1-EASE.out(clamp01(p*1.6));
  const a=1+(fa-1)*clamp01(ka);
  return {a:clamp01(a),dx:(from.dx||0)*k,dy:(from.dy||0)*k,s:1+((from.s??1)-1)*k,sy:1+((from.sy??1)-1)*k,
    rot:from.rot?(rnd(gi,7,seed)*2-1)*from.rot*k:0,blur:(from.blur||0)*Math.max(0,k)};
}

/* ---------- drawing */
function drawTextAt(g,it,px,t){
  if(t==null||!active(it)){drawText(g,it,px);return;}
  const fx=it.fx,ph=phaseAt(fx,t),def=ph&&FX[ph.f.type];
  if(def&&def.special){
    if(ph.f.type==='typewriter')typewriter(g,it,px,t,ph);
    else if(ph.f.type==='scramble')scramble(g,it,px,t,ph);
    else counter(g,it,px,t,ph);
    return;
  }
  const f=def?ph.f:null;
  // settled and nothing loops: the plain drawing (sharper glyph runs, ligatures)
  if(!fx.loop&&(!f||(!ph.out&&t>=f.t+f.dur)))return drawText(g,it,px);
  const L=textLayout(it),cs=charsOf(it),k=px/REF,seed=it.id|0,lh=(it.lh||1.15)*px,asc=L.asc*k,desc=L.desc*k;
  const split=f?(f.split||def.split):'chars';
  // groups (glyph runs that move together) and their extents
  const gid=c=>split==='lines'?c.line:split==='words'?c.word:cs.indexOf(c);
  const ext=new Map();
  cs.forEach((c,i)=>{const id=split==='chars'?i:gid(c),o=lineOrigin(it,L,c.line,px),x0=o.x+c.x*k,x1=x0+c.w*k;
    const e=ext.get(id);if(e){e.x0=Math.min(e.x0,x0);e.x1=Math.max(e.x1,x1);}else ext.set(id,{x0,x1,y:o.y,line:c.line});});
  const ids=[...ext.keys()],n=ids.length,lp=fx.loop;
  g.save();textStyle(g,it,px,L.bw*k);
  cs.forEach((c,i)=>{
    const id=split==='chars'?i:gid(c),G=ext.get(id),gi=ids.indexOf(id),o=lineOrigin(it,L,c.line,px),x=o.x+c.x*k;
    let st={a:1,dx:0,dy:0,s:1,sy:1,rot:0,blur:0};
    if(f){const {v,N}=orderIndex(gi,n,f.order,seed);st=groupState(f,def,groupP(f,v,N,t),ph.out,gi,seed);}
    if(lp){
      const amp=lp.amp??.5,sp=lp.speed||1;
      if(lp.type==='wave')st.dy-=amp*.25*Math.sin(2*Math.PI*(t*sp)-i*.45);
      else if(lp.type==='pulse')st.s*=1+amp*.12*(.5+.5*Math.sin(2*Math.PI*t*sp-i*.08));
      else if(lp.type==='jitter'){const fr=Math.floor(t*12*sp);st.dx+=(rnd(i,fr,seed)-.5)*amp*.12;st.dy+=(rnd(i,fr+7919,seed)-.5)*amp*.12;}
    }
    if(st.a<=.002)return;
    g.save();g.globalAlpha*=st.a;
    if(def&&def.mask){const top=G.y-asc-(lh-(asc+desc))/2;g.beginPath();g.rect(-1e5,top,2e5,lh);g.clip();}
    const cx=(G.x0+G.x1)/2,cy=G.y-asc*.35;
    g.translate(cx+st.dx*px,cy+st.dy*px);if(st.rot)g.rotate(st.rot*Math.PI/180);
    if(st.s!==1||st.sy!==1)g.scale(st.s,st.s*Math.max(.001,st.sy));
    g.translate(-cx,-cy);
    if(st.blur>.002&&'filter' in g)g.filter='blur('+(st.blur*px).toFixed(1)+'px)';
    g.fillText(c.c,x,o.y);g.restore();
  });
  g.restore();
}

// typewriter: glyphs appear one by one (an exit deletes from the end), with a blinking cursor
function typewriter(g,it,px,t,{f,out}){
  const L=textLayout(it),cs=charsOf(it),k=px/REF,n=cs.length,p=clamp01((t-f.t)/f.dur);
  const count=out?n-Math.floor(p*n+1e-9):Math.floor(p*n+1e-9);
  g.save();textStyle(g,it,px,L.bw*k);
  for(let i=0;i<count;i++){const c=cs[i],o=lineOrigin(it,L,c.line,px);g.fillText(c.c,o.x+c.x*k,o.y);}
  // the cursor: steady while typing, blinking just before and after
  const typing=t>=f.t&&t<f.t+f.dur,near=t>=f.t-.8&&t<f.t+f.dur+1.2;
  if(f.cursor!==false&&n&&near&&(typing||Math.floor(t*2.5)%2===0)){
    const c=cs[Math.max(0,count-1)],o=lineOrigin(it,L,c.line,px),x=count?o.x+(c.x+c.w)*k:o.x+c.x*k;
    g.shadowColor='transparent';g.fillRect(x+px*.04,o.y-L.asc*k*.86,Math.max(1,px*.07),(L.asc+L.desc*.6)*k*.92);
  }
  g.restore();
}

// scramble: glyphs come in as random characters and resolve left to right (order 'end': right to left)
function scramble(g,it,px,t,{f,out}){
  const L=textLayout(it),cs=charsOf(it),k=px/REF,n=Math.max(1,cs.length),seed=it.id|0,tick=Math.floor(t*18*(f.speed||1));
  g.save();textStyle(g,it,px,L.bw*k);
  cs.forEach((c,i)=>{
    const j=(f.order==='end'?n-1-i:i)/n,a=f.t+j*f.dur*.3,b=f.t+f.dur*.3+j*f.dur*.7;
    let ch=c.c;
    if(!out){if(t<a)return;if(t<b)ch=randomGlyph(c.c,f.chars,i,tick,seed);}
    else{const s=f.t+j*f.dur*.7,e=f.t+f.dur*.7+j*f.dur*.3;if(t>=e)return;if(t>=s)ch=randomGlyph(c.c,f.chars,i,tick,seed);}
    const o=lineOrigin(it,L,c.line,px);
    if(ch===c.c)g.fillText(ch,o.x+c.x*k,o.y);
    else{g.textAlign='center';g.fillText(ch,o.x+(c.x+c.w/2)*k,o.y);g.textAlign='left';}
  });
  g.restore();
}
function randomGlyph(c,set,i,tick,seed){
  let pool=SETS[set];
  if(!pool)pool=/\d/.test(c)?SETS.digits:c!==c.toLocaleLowerCase('tr')?SETS.upper:c!==c.toLocaleUpperCase('tr')?SETS.lower:SETS.symbols;
  return pool[Math.floor(rnd(i,tick,seed)*pool.length)];
}

// counter: every number in the text counts up from 0 (separators and decimals keep their format)
function counter(g,it,px,t,{f,out}){
  const L=textLayout(it),k=px/REF,p=out?1:(EASE[f.ease]||EASE.out)(clamp01((t-f.t)/f.dur));
  g.save();textStyle(g,it,px,L.bw*k);
  const ls='letterSpacing' in g?(it.ls||0)*px:0;
  L.lines.forEach((s,i)=>{
    const line=s.replace(/\d+(?:[.,]\d+)*/g,tok=>countTok(tok,p));
    const w=Math.max(0,g.measureText(line).width-(line?ls:0)),o=lineOrigin(it,L,i,px,w);
    g.fillText(line,o.x,o.y);
  });
  g.restore();
}
function countTok(tok,p){
  let ip=tok,dec='',decSep='';
  const last=Math.max(tok.lastIndexOf('.'),tok.lastIndexOf(','));
  if(last>=0&&tok.length-last-1!==3){ip=tok.slice(0,last);dec=tok.slice(last+1);decSep=tok[last];}
  const grp=(ip.match(/[.,]/)||[''])[0],digits=ip.replace(/[.,]/g,'')+dec;
  const str=String(Math.round(+digits*p)).padStart(dec.length+1,'0');
  let a=str.slice(0,str.length-dec.length);const b=str.slice(str.length-dec.length);
  if(grp)a=a.replace(/\B(?=(\d{3})+(?!\d))/g,grp);
  return a+(dec?decSep+b:'');
}

// when the item's effects end (for the timeline and the duration)
const fxSpan=f=>f?[f.t,f.t+f.dur]:null;

export {CHARSETS,FX,FX_EASES,LOOPS,ORDERS,SPLITS,STAGGER,drawTextAt,fxPad,fxSpan,newFx};
