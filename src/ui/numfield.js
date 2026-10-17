/* Number fields, the Figma way: a short label (X, Y, W…) and a text input.
   - Type a number, or a little sum (120+40, 200/2): Enter or leaving the field applies it, Esc puts the value back.
   - Words and percentages are passed on as typed (W: "100%", "fill", "hug"): def.set gets the raw text then.
   - ↑ / ↓ step by def.step (Shift: ×10).
   - Dragging the label scrubs the value (1 step per 2 px, Shift ×10).
   def = {id, label, title, get: () => number | null (null: empty / mixed), set: (v: number | string) => void,
   step (1), min, max, digits (0), suffix ('' | '%' | '°'), fmt (own formatter instead of digits + suffix),
   disabled: () => bool}. Returns {el, sync}. */
const EXPR=/^[\d\s.,+\-*/()]+$/;
function evaluate(text){
  const t=String(text).trim().replace(/,/g,'.');
  if(!t)return null;
  if(!EXPR.test(t))return t;  // words, %: the caller decides
  try{const v=Function('"use strict";return ('+t+')')();return Number.isFinite(v)?v:null;}catch(e){return null;}
}
function numField(def){
  const el=document.createElement('div');el.className='nf';if(def.wide)el.classList.add('wide');
  el.innerHTML='<label class="nfk"></label><input type="text" inputmode="decimal" spellcheck="false" autocomplete="off">';
  const lab=el.firstChild,inp=el.lastChild;inp.id=def.id;lab.htmlFor=def.id;lab.textContent=def.label;
  if(def.title){lab.title=def.title;inp.setAttribute('aria-label',def.title);}
  const step=def.step||1,dig=def.digits||0,suf=def.suffix||'';
  const clampV=v=>Math.min(def.max??Infinity,Math.max(def.min??-Infinity,v));
  const fmt=v=>v==null?'':def.fmt?def.fmt(v):(+v.toFixed(dig)).toString().replace('.',',')+suf;
  function sync(){
    const off=!!(def.disabled&&def.disabled());inp.disabled=off;el.classList.toggle('off',off);
    if(document.activeElement===inp&&!off)return;
    inp.value=fmt(def.get());
  }
  function commit(){
    // the field's own unit (°, %) is not part of the value
    let raw=inp.value.trim();if(suf&&raw.endsWith(suf))raw=raw.slice(0,-suf.length);const v=evaluate(raw);
    if(v===null){sync();return;}
    def.set(typeof v==='number'?clampV(v):v);sync();
  }
  inp.addEventListener('focus',()=>inp.select());
  inp.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();commit();inp.select();}
    else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();sync();inp.blur();}
    else if(e.key==='ArrowUp'||e.key==='ArrowDown'){
      e.preventDefault();e.stopPropagation();const cur=def.get();if(cur==null)return;
      def.set(clampV(cur+(e.key==='ArrowUp'?1:-1)*step*(e.shiftKey?10:1)));inp.value=fmt(def.get());inp.select();
    }
    e.stopPropagation();  // typing never reaches the editor's shortcuts
  });
  inp.addEventListener('change',commit);
  // scrub: drag the label sideways
  lab.addEventListener('pointerdown',e=>{
    if(e.button!==0||inp.disabled)return;const v0=def.get();if(v0==null)return;
    e.preventDefault();lab.setPointerCapture(e.pointerId);const x0=e.clientX;el.classList.add('scrub');
    const mv=ev=>{const d=Math.round((ev.clientX-x0)/2)*step*(ev.shiftKey?10:1);def.set(clampV(v0+d));inp.value=fmt(def.get());};
    const up=()=>{lab.removeEventListener('pointermove',mv);lab.removeEventListener('pointerup',up);lab.removeEventListener('pointercancel',up);el.classList.remove('scrub');};
    lab.addEventListener('pointermove',mv);lab.addEventListener('pointerup',up);lab.addEventListener('pointercancel',up);
  });
  return {el,sync,input:inp};
}

export {evaluate,numField};
