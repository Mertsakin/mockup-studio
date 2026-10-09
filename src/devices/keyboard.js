import * as THREE from 'three';
import {mesh,slab} from './geometry.js';
import {M} from './materials.js';
import {ANISO} from '../render/renderer.js';
import {mkCanvas} from '../util.js';

/* ---------- laptop keyboard ---------- */
const KB_ROWS=[
  {h:.62,keys:[['esc',1.5],['F1',1],['F2',1],['F3',1],['F4',1],['F5',1],['F6',1],['F7',1],['F8',1],['F9',1],['F10',1],['F11',1],['F12',1],['',1.5]]},
  {h:1,keys:[['"',1],['1',1],['2',1],['3',1],['4',1],['5',1],['6',1],['7',1],['8',1],['9',1],['0',1],['*',1],['-',1],['⌫',2]]},
  {h:1,keys:[['tab',1.5],['Q',1],['W',1],['E',1],['R',1],['T',1],['Y',1],['U',1],['I',1],['O',1],['P',1],['Ğ',1],['Ü',1],[',',1.5]]},
  {h:1,keys:[['caps',1.75],['A',1],['S',1],['D',1],['F',1],['G',1],['H',1],['J',1],['K',1],['L',1],['Ş',1],['İ',1],['enter',2.25]]},
  {h:1,keys:[['shift',1.25],['<',1],['Z',1],['X',1],['C',1],['V',1],['B',1],['N',1],['M',1],['Ö',1],['Ç',1],['.',1],['shift',2.75]]},
  {h:1,keys:[['ctrl',1.25],['fn',1],['alt',1.25],['',6],['alt gr',1.25],['ctrl',1.25],['◀',1],['▲▼',1],['▶',1]]}
];
function keyboardLayout(kbW){
  const p=kbW/15,gap=.3,rows=[];let z=0;
  const total=KB_ROWS.reduce((a,r)=>a+r.h*p,0);
  KB_ROWS.forEach(r=>{const rh=r.h*p;let x=-kbW/2;
    r.keys.forEach(([label,u])=>{const w=u*p;
      if(label==='▲▼'){rows.push({label:'▲',x:x+w/2,z:z+rh*.25,w:w-gap,d:rh/2-gap*.6});rows.push({label:'▼',x:x+w/2,z:z+rh*.75,w:w-gap,d:rh/2-gap*.6});}
      else if(label==='◀'||label==='▶')rows.push({label,x:x+w/2,z:z+rh*.75,w:w-gap,d:rh/2-gap*.6});
      else rows.push({label,x:x+w/2,z:z+rh/2,w:w-gap,d:rh-gap});
      x+=w;});
    z+=rh;});
  rows.forEach(k=>k.z-=total/2);
  return {keys:rows,depth:total};
}
function legendTexture(keys,kbW,kbD){
  const pxPer=4096/kbW,cw=4096,ch=Math.round(kbD*pxPer),c=mkCanvas(cw,ch),g=c.getContext('2d');
  g.fillStyle='rgba(232,235,240,1)';g.textBaseline='middle';
  keys.forEach(k=>{if(!k.label)return;const x=(k.x+kbW/2)*pxPer,y=(k.z+kbD/2)*pxPer,w=k.w*pxPer,h=k.d*pxPer;
    const single=k.label.length===1;
    if(single){g.textAlign='center';g.font='500 '+Math.round(h*.36)+'px "Instrument Sans", system-ui, sans-serif';g.fillText(k.label,x,y+h*.02);}
    else{g.textAlign='left';g.font='500 '+Math.round(Math.min(h,224)*.27)+'px "Instrument Sans", system-ui, sans-serif';g.fillText(k.label,x-w/2+h*.16,y+h*.22);}
  });
  const t=new THREE.CanvasTexture(c);t.anisotropy=ANISO;return t;
}
// capT: keycap thickness. Keys are plain meshes sharing one geometry per size (the path tracer cannot read InstancedMesh).
function buildKeyboard(kbW,capT=.26){
  const grp=new THREE.Group(),{keys,depth}=keyboardLayout(kbW),byW={};
  keys.forEach(k=>{const key=k.w.toFixed(3)+'x'+k.d.toFixed(3);(byW[key]=byW[key]||[]).push(k);});
  Object.values(byW).forEach(list=>{
    const k0=list[0],geo=slab(k0.w,k0.d,.16,capT,Math.min(.075,capT*.4));geo.rotateX(-Math.PI/2);
    list.forEach(k=>{const key=mesh(geo,M.keycap);key.position.set(k.x,0,k.z);grp.add(key);});
  });
  const lt=legendTexture(keys,kbW,depth);
  const lm=new THREE.MeshStandardMaterial({color:0xffffff,map:lt,alphaMap:lt,transparent:true,alphaTest:.3,roughness:.55,metalness:0,depthWrite:false});
  const legend=mesh(new THREE.PlaneGeometry(kbW,depth),lm);legend.rotation.x=-Math.PI/2;legend.position.y=capT/2+.004;legend.userData.decal=true;grp.add(legend);
  return {group:grp,depth,capT};
}

export {buildKeyboard};
