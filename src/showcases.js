// Showcases page: lists the templates (no 3D engine here); a card opens the studio with ?template=<id>.
import {TYPES} from './state/constants.js';
import {FORMATS,TEMPLATES} from './state/templates.js';

const grid=document.getElementById('grid'),filter=document.getElementById('filter');
let current='all';
function devicesLabel(t){
  const n={};t.devices.forEach(d=>{n[d.type]=(n[d.type]||0)+1;});
  return Object.entries(n).map(([k,c])=>(c>1?c+' ':'')+TYPES[k].toLowerCase()).join(' + ');
}
function render(){
  grid.innerHTML='';
  TEMPLATES.filter(t=>current==='all'||t.format===current).forEach(t=>{
    const [w,h]=t.ratio.split(':').map(Number),a=document.createElement('a');
    a.className='sc-card';a.href='./?template='+encodeURIComponent(t.id);
    a.innerHTML='<div class="sc-thumb" style="aspect-ratio:'+w+'/'+h+'"><img loading="lazy" alt="" src="showcases/'+t.id+'.jpg"></div>'+
      '<div class="sc-meta"><span class="sc-name"></span><span class="sc-sub"></span></div>';
    a.querySelector('.sc-name').textContent=t.name;
    a.querySelector('.sc-sub').textContent=FORMATS[t.format]+' · '+devicesLabel(t);
    a.setAttribute('aria-label',t.name+', '+FORMATS[t.format]+', '+devicesLabel(t)+'. Stüdyoda aç');
    grid.appendChild(a);
  });
}
[['all','Tümü'],...Object.entries(FORMATS)].forEach(([k,n])=>{
  const b=document.createElement('button');b.type='button';b.textContent=n;b.dataset.v=k;
  b.addEventListener('click',()=>{current=k;sync();render();});filter.appendChild(b);
});
function sync(){filter.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===current)));}
sync();render();
