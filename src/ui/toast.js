// no imports on purpose: the sign-in page (src/login.js) uses it without the editor (util.js brings three)
let tt=null;
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('show'),2600);}

export {toast};
