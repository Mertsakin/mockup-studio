/* ---------- lights ---------- */
const MAX_LIGHTS=8;
const LTYPES={directional:'Yönlü',point:'Nokta',spot:'Spot'};
let lid=0;
/* Light sources & modifiers. size = source width relative to the scene radius; sun uses its real angular size. */
const MODS=[
  {k:'sun',n:'Güneş',type:'directional',tan:.0093},
  {k:'overcast',n:'Bulutlu gök',type:'directional',size:4},
  {k:'window',n:'Pencere',type:'directional',size:1.6},
  {k:'flash',n:'Çıplak flaş',type:'spot',size:.03,angle:60,penumbra:.15},
  {k:'reflector',n:'Reflektör',type:'spot',size:.12,angle:38,penumbra:.3},
  {k:'dish',n:'Beauty dish',type:'spot',size:.45,angle:50,penumbra:.5},
  {k:'softbox',n:'Softbox',type:'spot',size:1.0,angle:65,penumbra:.85},
  {k:'umbrella',n:'Şemsiye',type:'spot',size:1.3,angle:75,penumbra:.8},
  {k:'octa',n:'Oktabox',type:'spot',size:1.9,angle:75,penumbra:.9},
  {k:'strip',n:'Strip box',type:'spot',size:.6,angle:45,penumbra:.7},
  {k:'bulb',n:'Çıplak ampul',type:'point',size:.08},
  {k:'custom',n:'Özel'}
];
const modOf=k=>MODS.find(m=>m.k===k)||MODS[MODS.length-1];
function newLight(o){
  const L=Object.assign({id:++lid,mod:'softbox',type:'spot',color:'#ffffff',intensity:1,az:0,el:45,dist:2.5,shadow:true,size:1,angle:65,penumbra:.85},o||{});
  if(o&&o.mod&&o.mod!=='custom'){const m=modOf(o.mod);['type','size','angle','penumbra'].forEach(k=>{if(m[k]!==undefined&&o[k]===undefined)L[k]=m[k];});}
  return L;
}
const LIGHT_PRESETS=[
  {n:'Yumuşak tavan',ambient:1,lights:[{mod:'octa',intensity:.95,az:15,el:78,dist:2.4}]},
  {n:'Stüdyo',ambient:.7,lights:[{mod:'softbox',intensity:1.25,az:-38,el:45,dist:2.2},{mod:'umbrella',intensity:.4,az:50,el:22,shadow:false},{mod:'strip',intensity:.8,az:165,el:35,dist:1.8,shadow:false}]},
  {n:'Gün ışığı',ambient:.6,lights:[{mod:'sun',color:'#fff3df',intensity:1.5,az:32,el:58}]},
  {n:'Çıplak flaş',ambient:.45,lights:[{mod:'flash',intensity:1.6,az:12,el:22,dist:3}]},
  {n:'Dramatik',ambient:.25,lights:[{mod:'reflector',intensity:2.4,az:-72,el:24,dist:2.2,angle:28}]},
  {n:'Pencere ışığı',ambient:.55,lights:[{mod:'window',intensity:1.3,az:-80,el:28,dist:2}]},
  {n:'Gün batımı',ambient:.45,lights:[{mod:'sun',color:'#ffb067',intensity:1.7,az:68,el:12},{mod:'overcast',color:'#8fb2ff',intensity:.4,az:-60,el:35,shadow:false}]},
  {n:'İki softbox',ambient:.6,lights:[{mod:'softbox',intensity:.95,az:-55,el:35},{mod:'softbox',intensity:.95,az:55,el:35}]}
];
function lightTan(L){const m=modOf(L.mod);return m.tan!==undefined?m.tan:L.size/Math.max(.05,L.dist);}
function shadowCharacter(L){
  const t=lightTan(L);
  const c=t<.03?'çok sert, keskin kenarlı':t<.12?'sert':t<.35?'orta yumuşaklıkta':t<.8?'yumuşak':'çok yumuşak, dağınık';
  const tip=L.mod==='sun'?'Güneş çok uzakta olduğu için gölge kenarları hep keskindir; yalnızca cisimden uzaklaştıkça hafifçe açılır.'
    :'Kaynağı büyütünce ya da ışığı yaklaştırınca gölge yumuşar, küçültünce ya da uzaklaştırınca sertleşir.';
  return '<b>Gölge: '+c+'.</b> '+tip;
}

export {LIGHT_PRESETS,LTYPES,MAX_LIGHTS,MODS,lightTan,modOf,newLight,shadowCharacter};
