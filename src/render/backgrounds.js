/* Pattern backgrounds drawn on a 2D canvas; used for the preview (as a CSS image) and for the export, so both match.
   Everything is relative to the canvas size: the same composition at any resolution.
   base = ground colour, accent = light / line / shape colour. Generic geometric designs, no brand artwork. */
const PATTERNS={shards:'Kırık ışık',grid:'Izgara',glow:'Parıltı',circle:'Daire'};

function hexRgb(h){const n=parseInt(h.slice(1),16);return [n>>16&255,n>>8&255,n&255];}
const rgba=(h,a)=>{const [r,g,b]=hexRgb(h);return 'rgba('+r+','+g+','+b+','+a+')';};
function mix(h1,h2,t){const a=hexRgb(h1),b=hexRgb(h2);return '#'+a.map((v,i)=>Math.round(v+(b[i]-v)*t).toString(16).padStart(2,'0')).join('');}
const luma=h=>{const [r,g,b]=hexRgb(h);return (.2126*r+.7152*g+.0722*b)/255;};

// long glossy light streaks crossing the frame at a shallow angle, over darker facets
function shards(g,W,H,base,accent){
  const s=Math.max(W,H),m=Math.min(W,H),dark=luma(base)<.5,lift=mix(base,dark?'#ffffff':'#000000',.07);
  g.fillStyle=base;g.fillRect(0,0,W,H);
  const band=(x,y,deg,w,col,alpha,soft)=>{g.save();g.translate(x*W,y*H);g.rotate(deg*Math.PI/180);
    const gr=g.createLinearGradient(0,-w*m/2,0,w*m/2);
    gr.addColorStop(0,rgba(col,0));gr.addColorStop(soft,rgba(col,alpha));gr.addColorStop(.5,rgba(col,alpha*.55));gr.addColorStop(1,rgba(col,0));
    g.fillStyle=gr;g.fillRect(-s*2,-w*m/2,s*4,w*m);g.restore();};
  // facets: broad, barely lighter planes give the surface some depth
  band(.2,.15,-24,.55,lift,1,.5);band(.85,.7,-24,.7,lift,.8,.35);
  // light streaks
  band(.18,.08,-24,.12,accent,.9,.38);band(.55,.02,-24,.04,accent,.65,.45);band(.96,.28,-30,.2,accent,.75,.3);
  band(.12,.98,-18,.08,accent,.35,.4);band(.7,.55,-24,.015,mix(accent,'#ffffff',.5),.5,.5);
  const v=g.createRadialGradient(W/2,H/2,m*.2,W/2,H/2,s*.8);v.addColorStop(0,rgba(base,0));v.addColorStop(1,rgba(base,.85));
  g.fillStyle=v;g.fillRect(0,0,W,H);
}
function grid(g,W,H,base,accent){
  const m=Math.min(W,H),step=m/28,lw=Math.max(1,m/1400);
  g.fillStyle=base;g.fillRect(0,0,W,H);
  g.strokeStyle=rgba(accent,.22);g.lineWidth=lw;g.beginPath();
  for(let x=(W/2)%step;x<=W;x+=step){g.moveTo(Math.round(x)+.5,0);g.lineTo(Math.round(x)+.5,H);}
  for(let y=(H/2)%step;y<=H;y+=step){g.moveTo(0,Math.round(y)+.5);g.lineTo(W,Math.round(y)+.5);}
  g.stroke();
  const r=g.createRadialGradient(W/2,H*.45,0,W/2,H*.45,Math.max(W,H)*.6);r.addColorStop(0,rgba(base,.85));r.addColorStop(.55,rgba(base,.35));r.addColorStop(1,rgba(base,0));
  g.fillStyle=r;g.fillRect(0,0,W,H);
}
function glow(g,W,H,base,accent){
  const s=Math.max(W,H);
  g.fillStyle=base;g.fillRect(0,0,W,H);
  const r=g.createRadialGradient(W/2,H*.38,0,W/2,H*.38,s*.75);r.addColorStop(0,rgba(accent,.95));r.addColorStop(.45,rgba(accent,.35));r.addColorStop(1,rgba(accent,0));
  g.fillStyle=r;g.fillRect(0,0,W,H);
}
function circle(g,W,H,base,accent){
  const m=Math.min(W,H);
  g.fillStyle=base;g.fillRect(0,0,W,H);
  g.fillStyle=accent;g.beginPath();g.arc(W*.62,H*.8,m*.46,0,Math.PI*2);g.fill();
}
const DRAW={shards,grid,glow,circle};
function drawPattern(g,W,H,kind,base,accent){(DRAW[kind]||shards)(g,W,H,base,accent);}

export {PATTERNS,drawPattern};
