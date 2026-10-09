import {$} from '../util.js';

let tt=null;
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('show'),2600);}

export {toast};
