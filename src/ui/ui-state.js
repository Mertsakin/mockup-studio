/* Editor UI state that is not part of the document: what kind of thing the inspector shows and which tool is active.
   kind: 'board' | 'device' | 'light' | 'item' | 'multi' (the device / light / item itself is state.selected / selLight /
   selItem; 'multi': devices and items picked together, ui/selection.js)
   mode: 'design' (Tasarla) | 'animate' (Canlandır, ui/animate.js)
   tool: 'select' | 'move' | 'rotate' | 'orbit' | 'hand' | 'text' | 'frame' (insert.js) | 'zoom' (workspace.js);
   space: Space held (temporary hand)
   tlFocus: the last press was in the timeline (set directly by ui/timeline.js, no change event): its ⌘A and Esc act
   on the keys then, and ui/selection.js leaves them alone */
const ui={kind:'board',tool:'select',space:false,mode:'design',tlFocus:false};
const subs=[];
function onUi(fn){subs.push(fn);}
function setUi(o){let ch=false;for(const k in o)if(ui[k]!==o[k]){ui[k]=o[k];ch=true;}if(ch)subs.forEach(f=>f(ui));}
const panning=()=>ui.tool==='hand'||ui.space;

export {onUi,panning,setUi,ui};
