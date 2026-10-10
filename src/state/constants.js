const TYPES={phone:'Telefon',tablet:'Tablet',laptop:'Dizüstü',monitor:'Monitör',browser:'Tarayıcı',page:'Sade ekran',custom:'Kendi çerçeven'};
const DEFAULT_SCENE={phone:{rx:-6,ry:26,rz:0},tablet:{rx:-6,ry:24,rz:0},laptop:{rx:16,ry:-26,rz:0},monitor:{rx:6,ry:-22,rz:0},browser:{rx:-6,ry:22,rz:0},page:{rx:-8,ry:18,rz:0},custom:{rx:-4,ry:22,rz:0}};
const COLORS=[
  {k:'graphite',n:'Grafit',c:'#2b2f36',m:.55,r:.32},{k:'silver',n:'Gümüş',c:'#c8cbd0',m:.85,r:.26},
  {k:'white',n:'Beyaz',c:'#ecebe7',m:.05,r:.42},{k:'navy',n:'Gece mavisi',c:'#24304a',m:.5,r:.34},
  {k:'sage',n:'Adaçayı',c:'#9aab98',m:.35,r:.4},{k:'coral',n:'Mercan',c:'#e07a6a',m:.3,r:.38}
];
const THEMES={
  light:{body:'#f4f5f7',bar:'#e9ecf0',pill:'#ffffff',text:'#4a5260',dot:'#c2c7ce',line:'#d6dae0'},
  dark:{body:'#24272d',bar:'#2d3037',pill:'#1c1f24',text:'#c3c9d2',dot:'#4d525b',line:'#1a1c20'}
};
const PRESETS=[
  {n:'Önden',v:{rx:0,ry:0,rz:0},up:{rx:8,ry:0,rz:0}},
  {n:'Vitrin',v:{rx:-12,ry:32,rz:5},up:{rx:20,ry:-34,rz:0}},
  {n:'Sağa bakan',v:{rx:-4,ry:30,rz:0},up:{rx:14,ry:30,rz:0}},
  {n:'Sola bakan',v:{rx:-4,ry:-30,rz:0},up:{rx:14,ry:-30,rz:0}},
  {n:'Arkaya yaslı',v:{rx:-24,ry:0,rz:0},up:{rx:32,ry:0,rz:0}},
  {n:'İzometrik',v:{rx:-58,ry:0,rz:38},up:{rx:35,ry:45,rz:0}},
  {n:'Yan profil',v:{rx:0,ry:72,rz:0},up:{rx:10,ry:80,rz:0}},
  {n:'Arkası',v:{rx:-4,ry:160,rz:0},up:{rx:12,ry:155,rz:0}}
];
const COMPS=[
  {n:'Tek telefon',items:[{type:'phone'}],scene:{rx:-6,ry:26,rz:0}},
  {n:'Telefon + dizüstü',items:[{type:'laptop'},{type:'phone',px:17,py:-2.45,pz:7,ry:-16}],scene:{rx:12,ry:-18,rz:0}},
  {n:'Telefon yelpazesi',items:[{type:'phone',px:-7.6,py:.23,pz:-1.5,ry:18,rz:6},{type:'phone',pz:2},{type:'phone',px:7.6,py:.23,pz:-1.5,ry:-18,rz:-6}],scene:{rx:-6,ry:0,rz:0}},
  {n:'Tablet + telefon',items:[{type:'tablet',px:-4,pz:-2,ry:12},{type:'phone',px:10.5,py:-5.05,pz:4,ry:-14}],scene:{rx:-6,ry:18,rz:0}},
  {n:'Masaüstü seti',items:[{type:'monitor'},{type:'laptop',px:-31,py:-10.25,pz:8,ry:22},{type:'phone',px:27,py:-12.6,pz:10,ry:-22}],scene:{rx:8,ry:0,rz:0}},
  {n:'Tarayıcı + telefon',items:[{type:'browser',ry:6},{type:'phone',px:14.5,py:-3.6,pz:5,ry:-12}],scene:{rx:-6,ry:18,rz:0}}
];
const DEFAULT_FINISH={phone:'anodized',tablet:'anodized',laptop:'anodized',monitor:'anodized',browser:'matte',page:'matte',custom:'matte'};

// device scale range (inspector slider, transform box, layer-order compensation)
const SCALE_MIN=.1,SCALE_MAX=10;

export {SCALE_MAX,SCALE_MIN,COLORS,COMPS,DEFAULT_FINISH,DEFAULT_SCENE,PRESETS,THEMES,TYPES};
