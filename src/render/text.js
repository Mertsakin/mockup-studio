/* Text layers: layout and drawing of a 2D text item (state.items, kind 'text'). Shared by the live view (a canvas per
   item, ui/layout.js), the export and the thumbnails (paintItems), so all of them break lines and place glyphs the same way.

   Item fields: text, font (family), weight, italic, size (font size as a fraction of the board width), color, fill
   ('solid' | 'gradient', gradient = color -> color2, left to right), align ('left' | 'center' | 'right'), lh (line height,
   x font size), ls (letter spacing, x font size), wrap (box width in font sizes; 0 = no wrapping, lines only at
   newlines), shadow (0..1). The item's width and height follow from the text: see textBox. */

// Google Fonts offered in the font menu (weights each family has; italics are synthesised by the browser)
const FONTS=[
  ['Inter','sans',[400,500,600,700,800,900]],
  ['Manrope','sans',[400,500,600,700,800]],
  ['Plus Jakarta Sans','sans',[400,500,600,700,800]],
  ['DM Sans','sans',[400,500,700]],
  ['Poppins','sans',[400,500,600,700,800,900]],
  ['Montserrat','sans',[400,500,600,700,800,900]],
  ['Outfit','sans',[400,500,600,700,800]],
  ['Sora','sans',[400,600,700,800]],
  ['Space Grotesk','sans',[400,500,600,700]],
  ['Bricolage Grotesque','sans',[400,600,700,800]],
  ['Urbanist','sans',[400,600,700,800]],
  ['Lexend','sans',[400,500,600,700]],
  ['Work Sans','sans',[400,600,700,800]],
  ['Rubik','sans',[400,500,700,800]],
  ['Nunito','sans',[400,600,700,800,900]],
  ['Archivo','sans',[400,600,700,800,900]],
  ['Oswald','sans',[400,500,600,700]],
  ['Bebas Neue','sans',[400]],
  ['Anton','sans',[400]],
  ['Playfair Display','serif',[400,600,700,800,900]],
  ['DM Serif Display','serif',[400]],
  ['Instrument Serif','serif',[400]],
  ['Fraunces','serif',[400,600,700,900]],
  ['Lora','serif',[400,600,700]],
  ['JetBrains Mono','monospace',[400,700]],
  ['Space Mono','monospace',[400,700]],
  ['Caveat','cursive',[400,700]],
  ['Pacifico','cursive',[400]]
].map(([name,kind,weights])=>({name,kind,weights}));
const FONT_BY=new Map(FONTS.map(f=>[f.name,f]));
const WEIGHT_NAMES={100:'İnce',200:'Çok hafif',300:'Hafif',400:'Normal',500:'Orta',600:'Yarı kalın',700:'Kalın',800:'Ekstra kalın',900:'Siyah'};
const weightsOf=family=>(FONT_BY.get(family)||{weights:[400,700]}).weights;
// nearest weight the family has
const fitWeight=(family,w)=>weightsOf(family).reduce((a,b)=>Math.abs(b-w)<Math.abs(a-w)?b:a);

const TEXT_DEFAULTS={text:'Başlığınız',font:'Inter',weight:700,italic:false,size:.06,color:'#111111',color2:'#6d5dfc',fill:'solid',
  align:'center',lh:1.15,ls:0,wrap:0,shadow:0};

/* ---------- font loading: one stylesheet per family, on first use; every load bumps fontVersion (layouts measured with
   the fallback font are thrown away) and calls the onFont hooks (the live view redraws) */
let fontVersion=0;
const sheets=new Map(),loaded=new Set(),pending=new Set(),fontSubs=[];  // sheets: family -> stylesheet loaded (promise)
function onFont(fn){fontSubs.push(fn);}
const GENERIC={sans:'sans-serif',serif:'serif',monospace:'monospace',cursive:'cursive',custom:'sans-serif'};
const stack=family=>'"'+family+'",'+GENERIC[(FONT_BY.get(family)||{}).kind||'sans'];
const fontSpec=(it,px)=>(it.italic?'italic ':'')+(it.weight||400)+' '+px+'px '+stack(it.font);
// latin and the Turkish letters (latin-ext subset), so a later edit does not need another file
const SAMPLE='AaZzĞğİıŞşÇçÖöÜü09';
const fontDone=()=>{fontVersion++;fontSubs.forEach(fn=>fn());};
function useFont(it){
  const f=FONT_BY.get(it.font);if(!f||f.kind==='custom'||typeof document==='undefined'||!document.fonts)return;
  if(!sheets.has(f.name))sheets.set(f.name,new Promise(res=>{
    const l=document.createElement('link');l.rel='stylesheet';l.onload=l.onerror=()=>res();
    l.href='https://fonts.googleapis.com/css2?family='+f.name.replace(/ /g,'+')+':wght@'+f.weights.join(';')+'&display=swap';
    document.head.appendChild(l);}));
  // document.fonts.check() is true while no face is registered yet: wait for the stylesheet, then load the face
  const spec=fontSpec(it,100);if(loaded.has(spec)||pending.has(spec))return;
  pending.add(spec);
  sheets.get(f.name).then(()=>document.fonts.load(spec,SAMPLE+(it.text||''))).catch(()=>{}).then(()=>{pending.delete(spec);loaded.add(spec);fontDone();});
}
/* Fonts the user uploaded (kept in the document as data URLs, ui/boards.js): registered as FontFaces. Weights other
   than the file's own are synthesised by the browser. */
const custom=new Map();  // family -> data URL
function addFontFace(family,data){
  if(custom.get(family)===data||typeof FontFace==='undefined')return;
  custom.set(family,data);FONT_BY.set(family,{name:family,kind:'custom',weights:[400,700]});
  const key='custom:'+family;pending.add(key);
  const done=()=>{pending.delete(key);fontDone();};
  new FontFace(family,'url('+data+')').load().then(f=>{document.fonts.add(f);done();},e=>{console.warn('Yazı tipi yüklenemedi:',family,e);done();});
}
const customFonts=()=>[...custom.keys()];
// resolves when every font the items use has loaded (or failed): the export waits for it
async function fontsReady(items){
  items.forEach(it=>{if(it.kind==='text')useFont(it);});
  for(let i=0;i<300&&pending.size;i++)await new Promise(r=>setTimeout(r,50));  // at most 15 s (a slow network)
  if(document.fonts)await document.fonts.ready;
}

/* ---------- layout, measured at a 100 px font size and cached */
const REF=100;
let mctx=null;
const ctx=()=>mctx||(mctx=document.createElement('canvas').getContext('2d'));
const cache=new Map();
const layoutKey=it=>[it.text,it.font,it.weight,it.italic?1:0,it.ls||0,it.wrap||0,it.lh,fontVersion].join('\u0001');
function setFont(g,it,px){g.font=fontSpec(it,px);if('letterSpacing' in g)g.letterSpacing=((it.ls||0)*px).toFixed(2)+'px';}
// line width without the letter spacing the browser adds after the last glyph
const lineW=(g,s,it,px)=>s?Math.max(0,g.measureText(s).width-('letterSpacing' in g?(it.ls||0)*px:0)):0;
function textLayout(it){
  const key=layoutKey(it);let L=cache.get(key);if(L)return L;
  useFont(it);
  const g=ctx();setFont(g,it,REF);
  const maxW=(it.wrap||0)*REF,lines=[];
  String(it.text??'').split('\n').forEach(par=>{
    if(!maxW){lines.push(par);return;}
    // greedy word wrap; a word longer than the box is broken by characters
    let cur='';
    for(const word of par.split(/(\s+)/)){
      if(!word)continue;
      const next=cur+word;
      if(!cur||lineW(g,next.trimEnd(),it,REF)<=maxW){cur=next;continue;}
      lines.push(cur.trimEnd());cur=/^\s+$/.test(word)?'':word;
      while(lineW(g,cur,it,REF)>maxW&&cur.length>1){let n=cur.length-1;while(n>1&&lineW(g,cur.slice(0,n),it,REF)>maxW)n--;lines.push(cur.slice(0,n));cur=cur.slice(n);}
    }
    lines.push(cur.trimEnd());
  });
  const ws=lines.map(s=>lineW(g,s,it,REF)),m=g.measureText('Hgİ');
  const asc=m.fontBoundingBoxAscent||REF*.92,desc=m.fontBoundingBoxDescent||REF*.24;
  const bw=Math.max(maxW||0,...ws,REF*.3),bh=Math.max(1,lines.length)*REF*(it.lh||1.15);
  L={lines,ws,bw,bh,asc,desc};
  if(cache.size>400)cache.clear();cache.set(key,L);return L;
}
/* Characters of the laid-out text, for effects that move them one by one (render/text-fx.js): per line, each glyph's
   start and width at 100 px (prefix widths, so kerning and letter spacing stay), its word and line index. Spaces are
   left out (they draw nothing) but count in the positions. Cached with the layout. */
function charsOf(it){
  const L=textLayout(it);if(L.chars)return L.chars;
  const g=ctx();setFont(g,it,REF);
  const out=[];let word=-1;
  L.lines.forEach((line,li)=>{
    const cs=Array.from(line);let pre='',x0=0,inWord=false;
    cs.forEach(c=>{
      pre+=c;const x1=g.measureText(pre).width;
      if(/\s/.test(c))inWord=false;
      else{if(!inWord){word++;inWord=true;}out.push({c,line:li,word,x:x0,w:x1-x0});}
      x0=x1;
    });
  });
  L.words=word+1;L.chars=out;return out;
}
// size of the text block on a board W px wide (px); the item's rectangle
function textBox(it,W){const L=textLayout(it),k=(it.size||.06)*W/REF;return {w:L.bw*k,h:L.bh*k};}
// room around the block for glyph overhang (italics, swashes) and the shadow, as a fraction of the font size
const textPad=it=>.35+(it.shadow>0?.6:0);

// font, fill and shadow of the item on g at font size px (the block is bw wide, centred on 0)
function textStyle(g,it,px,bw){
  setFont(g,it,px);g.textBaseline='alphabetic';g.textAlign='left';
  if(it.fill==='gradient'){const gr=g.createLinearGradient(-bw/2,0,bw/2,0);gr.addColorStop(0,it.color);gr.addColorStop(1,it.color2||it.color);g.fillStyle=gr;}
  else g.fillStyle=it.color||'#111111';
  if(it.shadow>0){g.shadowColor='rgba(0,0,0,'+(.18+.32*it.shadow).toFixed(3)+')';g.shadowBlur=px*(.08+.3*it.shadow);g.shadowOffsetY=px*(.02+.08*it.shadow);}
}
// where line i starts (x) and its baseline (y), relative to the block's centre, at font size px
function lineOrigin(it,L,i,px,w){
  const k=px/REF,bw=L.bw*k,bh=L.bh*k,lh=(it.lh||1.15)*px,asc=L.asc*k,desc=L.desc*k;
  if(w===undefined)w=L.ws[i]*k;
  return {x:it.align==='left'?-bw/2:it.align==='right'?bw/2-w:-w/2,y:-bh/2+i*lh+(lh-(asc+desc))/2+asc};
}
/* Draws the block centred on (0, 0) of g's current transform at font size px (settled: no effect). */
function drawText(g,it,px){
  const L=textLayout(it);
  g.save();textStyle(g,it,px,L.bw*px/REF);
  L.lines.forEach((s,i)=>{const o=lineOrigin(it,L,i,px);g.fillText(s,o.x,o.y);});
  g.restore();
}

/* Keeps the text's anchor (top edge, and the left / right edge for left / right aligned text) in place while a change
   resizes the block: keepAnchor(it, W, H, fn) runs fn, then moves the centre; moveAnchor does the same given the box from
   before the change (textBox). W, H: board size in px. */
function moveAnchor(it,W,H,a){
  const b=textBox(it,W),dx=(b.w-a.w)/2*(it.align==='left'?1:it.align==='right'?-1:0),dy=(b.h-a.h)/2,r=(it.rot||0)*Math.PI/180;
  it.x=+(it.x+(dx*Math.cos(r)-dy*Math.sin(r))/W).toFixed(4);it.y=+(it.y+(dx*Math.sin(r)+dy*Math.cos(r))/H).toFixed(4);
}
function keepAnchor(it,W,H,fn){const a=textBox(it,W);fn();moveAnchor(it,W,H,a);}

export {FONTS,REF,TEXT_DEFAULTS,WEIGHT_NAMES,addFontFace,charsOf,customFonts,drawText,lineOrigin,textStyle,fitWeight,fontsReady,keepAnchor,moveAnchor,onFont,textBox,textLayout,textPad,useFont,weightsOf};
