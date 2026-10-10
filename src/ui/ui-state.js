/* Editor UI state that is not part of the document: what kind of thing the inspector shows and which tool is active.
   kind: 'board' | 'device' | 'light' | 'item' (the device / light / item itself is state.selected / selLight / selItem)
   mode: 'design' (Tasarla) | 'animate' (Canlandır, ui/animate.js)
   tool: 'select' | 'move' | 'rotate' | 'orbit' | 'hand'; space: Space held (temporary hand) */
const ui={kind:'board',tool:'select',space:false,mode:'design'};
const subs=[];
function onUi(fn){subs.push(fn);}
function setUi(o){let ch=false;for(const k in o)if(ui[k]!==o[k]){ui[k]=o[k];ch=true;}if(ch)subs.forEach(f=>f(ui));}
const panning=()=>ui.tool==='hand'||ui.space;

export {onUi,panning,setUi,ui};
