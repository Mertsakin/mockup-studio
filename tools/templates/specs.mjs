/* The studio's template set (wireframes/templates.html: neutral studio sweep, soft light, one accent, little and
   calm type). Each template has a light and a dark variant; tools/templates/build.mjs renders them with sample
   screens into public/templates/<id>-<variant>.jpg and saves them with their screens emptied as
   public/templates/<id>-<variant>.mockup.json (a project file: the Şablonlar tab and the welcome card open it).

   A variant is a template-like object for applyTemplate (ratio, bg, lights, scene, settle, devices with sample
   screens in img) plus texts (addText props), lensMm, dof ({fnum, focus: device index}), motion ([{to: 'cam' | a
   device index, preset}] and text effects [{text: name, fx: type, t}]), dur (s); or, for a store set,
   store: options for the store set generator (ui/store.js) with its own theme colours. */
const S='/tools/landing/src/',J='Plus Jakarta Sans',I='Inter';
const LIGHT_INK='#14161c',LIGHT_SUB='#5a5f6b',DARK_INK='#ffffff',DARK_SUB='#a3a7b2',ACCENT='#0b68f5',ACCENT_DARK='#5a9cff';
const sweep={light:{bg:'solid',solid:'#efeeeb'},dark:{bg:'gradient',gradType:'radial',bg1:'#2a2c31',bg2:'#0c0d0f'}};
const fade={light:{bg:'gradient',gradType:'linear',gradAngle:180,bg1:'#f3f4f7',bg2:'#e4e7ee'},dark:{bg:'gradient',gradType:'linear',gradAngle:180,bg1:'#1d1f25',bg2:'#0e0f12'}};
const lights={light:'Yumuşak tavan',dark:'Dramatik'};
const phoneShot=v=>S+(v==='dark'?'app-dark.png':'app-light.png');
const col=v=>v==='dark'?'graphite':'graphite';

// a headline block (kicker, title, subtitle) with one box width so the left edges line up (wrap is in em). Sizes are
// fractions of the board's width, positions of its height: ar (width / height) turns one em into height units
function block(v,{x,y,w,kicker,title,sub,size=.046,align='left',ar=16/9}){
  const em=size*ar;
  const ink=v==='dark'?DARK_INK:LIGHT_INK,s=v==='dark'?DARK_SUB:LIGHT_SUB,acc=v==='dark'?ACCENT_DARK:ACCENT,out=[];
  if(kicker)out.push({name:'Üst başlık',text:kicker,font:I,weight:600,size:size*.3,x,y:y-em*1.5,ls:.14,color:acc,align,wrap:w/(size*.3)});
  out.push({name:'Başlık',text:title,font:J,weight:800,size,x,y,lh:1.05,ls:-.02,color:ink,align,wrap:w/size});
  if(sub)out.push({name:'Alt başlık',text:sub,font:I,weight:500,size:size*.39,x,y:y+em*1.85,lh:1.4,color:s,align,wrap:w/(size*.39)});
  return out;
}

const TEMPLATES=[
  // ---------- açılış görseli (16:9)
  {id:'studio',n:'Stüdyo',goal:'land',d:'Dizüstü ve telefon, kesintisiz fon',W:1280,H:720,
    v:v=>({ratio:'16:9',bg:sweep[v],lights:v==='dark'?'Dramatik':'Stüdyo',settle:true,scene:{rx:10,ry:v==='dark'?20:-16,zoom:1.05},
      devices:[{type:'laptop',img:S+'studio-laptop.png',colorKey:col(v)},{type:'phone',px:v==='dark'?-19:19,pz:7,ry:v==='dark'?18:-18,img:phoneShot(v),colorKey:col(v)}]})},
  {id:'hero',n:'Başlıklı hero',goal:'land',d:'Solda başlık, sağda telefon',W:1280,H:720,
    v:v=>({ratio:'16:9',bg:fade[v],lights:lights[v],scene:{rx:-6,ry:-24,zoom:.82,panX:.2},devices:[{type:'phone',img:phoneShot(v),colorKey:col(v)}],
      texts:block(v,{x:.29,y:.43,w:.44,kicker:'YENİ SÜRÜM',title:'Ekibin için\ntek çalışma alanı',sub:'Görevler, takvim ve notlar\nbir arada, her cihazda.'})})},
  {id:'browser',n:'Tarayıcı penceresi',goal:'land',d:'Sitenin kendisi, sade fon',W:1280,H:720,
    v:v=>({ratio:'16:9',bg:v==='dark'?{bg:'solid',solid:'#141518'}:{bg:'solid',solid:'#e9ebef'},lights:lights[v],scene:{rx:-4,ry:14,zoom:1.08},
      devices:[{type:'browser',img:S+'studio-monitor.png',url:'siten.com',theme:v}]})},
  {id:'desk',n:'Masa başı',goal:'land',d:'Monitör, dizüstü ve telefon',W:1280,H:720,
    v:v=>({ratio:'16:9',bg:v==='dark'?sweep.dark:{bg:'solid',solid:'#eceae6'},lights:v==='dark'?'Dramatik':'Stüdyo',settle:true,scene:{rx:8,ry:0,zoom:1},
      devices:[{type:'monitor',img:S+'studio-monitor.png',colorKey:col(v)},{type:'laptop',px:-31,py:-10.25,pz:8,ry:22,img:S+'studio-laptop.png',colorKey:col(v)},
        {type:'phone',px:27,py:-12.6,pz:10,ry:-22,img:phoneShot(v),colorKey:col(v)}]})},
  // ---------- mağaza seti (App Store 6,9", 5 ekran)
  {id:'store-classic',n:'Mağaza · klasik',goal:'store',d:'Beş ekran, başlık üstte',W:1320,H:2868,set:5,
    v:v=>({store:{size:'ios-69',layout:'classic',theme:v==='dark'?{id:'t-dark',n:'Koyu',c1:'#1a1b1f',c2:'#0b0c0e',ink:DARK_INK,sub:DARK_SUB,dev:'graphite'}:{id:'t-light',n:'Açık',c1:'#f4f3f0',c2:'#ecebe7',ink:LIGHT_INK,sub:'#6a6f7a',dev:'graphite'},
      font:J,shots:[phoneShot(v),S+'app-gallery.png',S+(v==='dark'?'app-light.png':'app-dark.png'),phoneShot(v),S+'app-gallery.png']}})},
  {id:'store-tilt',n:'Mağaza · dönüşümlü',goal:'store',d:'Beş ekran, sırayla eğik',W:1320,H:2868,set:5,
    v:v=>({store:{size:'ios-69',layout:'tilt',theme:v==='dark'?{id:'t-dark',n:'Koyu',c1:'#1d1f25',c2:'#0e0f12',ink:DARK_INK,sub:DARK_SUB,dev:'graphite'}:{id:'t-light',n:'Açık',c1:'#f3f4f7',c2:'#e4e7ee',ink:LIGHT_INK,sub:'#6a6f7a',dev:'graphite'},
      font:J,shots:[phoneShot(v),S+'app-gallery.png',S+(v==='dark'?'app-light.png':'app-dark.png'),phoneShot(v),S+'app-gallery.png']}})},
  // ---------- sosyal
  {id:'trio',n:'Kare üçlü',goal:'social',d:'Üç ekran yelpaze, 1:1',W:900,H:900,
    v:v=>({ratio:'1:1',bg:v==='dark'?{bg:'gradient',gradType:'linear',gradAngle:160,bg1:'#1d1e24',bg2:'#121316'}:{bg:'gradient',gradType:'linear',gradAngle:160,bg1:'#eeedf4',bg2:'#f4efe9'},lights:lights[v],scene:{rx:-6,ry:0,zoom:1},
      devices:[{type:'phone',px:-7.6,py:.23,pz:-1.5,ry:18,rz:6,img:S+'app-gallery.png',colorKey:col(v)},{type:'phone',pz:2,img:phoneShot(v),colorKey:col(v)},
        {type:'phone',px:7.6,py:.23,pz:-1.5,ry:-18,rz:-6,img:S+(v==='dark'?'app-light.png':'app-dark.png'),colorKey:col(v)}]})},
  {id:'bokeh',n:'Portre · bokeh',goal:'social',d:'85 mm f/2, arkada tablet, 4:5',W:800,H:1000,
    v:v=>({ratio:'4:5',bg:v==='dark'?{bg:'solid',solid:'#151619'}:{bg:'solid',solid:'#ecebe7'},lights:v==='dark'?'Dramatik':'Pencere ışığı',settle:true,lensMm:85,dof:{fnum:2,focus:1},scene:{rx:4,ry:-22,zoom:1.35},
      devices:[{type:'tablet',px:-11,pz:-22,ry:10,scale:.9,img:S+'showcases-tablet.png',colorKey:col(v)},{type:'phone',px:2,pz:6,ry:-12,img:phoneShot(v),colorKey:col(v)}]})},
  {id:'story',n:'Story',goal:'social',d:'Büyük telefon, altta başlık, 9:16',W:540,H:960,
    v:v=>({ratio:'9:16',bg:fade[v],lights:lights[v],scene:{rx:-8,ry:-20,rz:-4,zoom:1.2,panY:.12},devices:[{type:'phone',img:phoneShot(v),colorKey:col(v)}],
      texts:block(v,{x:.5,y:.83,w:.84,title:'Her şey\ntek bir yerde',sub:'Şimdi indir, ücretsiz dene.',size:.085,align:'center',ar:9/16})})},
  // ---------- video (hareketli)
  {id:'push-in',n:'Yaklaşarak giriş',goal:'video',d:'Kamera yaklaşır, cihazlar sahnede',W:1280,H:720,dur:5,
    v:v=>({ratio:'16:9',bg:sweep[v],lights:v==='dark'?'Dramatik':'Stüdyo',settle:true,scene:{rx:10,ry:-16,zoom:1.05},
      devices:[{type:'laptop',img:S+'studio-laptop.png',colorKey:col(v)},{type:'phone',px:19,pz:7,ry:-18,img:phoneShot(v),colorKey:col(v)}],
      motion:[{to:'cam',preset:'c-push'}]})},
  {id:'float-title',n:'Süzülen başlık',goal:'video',d:'Telefon süzülür, başlık kelime kelime gelir',W:540,H:960,dur:5,
    v:v=>({ratio:'9:16',bg:fade[v],lights:lights[v],scene:{rx:-4,ry:-14,zoom:1.12,panY:-.16},devices:[{type:'phone',img:phoneShot(v),colorKey:col(v)}],
      texts:block(v,{x:.5,y:.12,w:.86,title:'Planını\nsaniyeler içinde kur',sub:'Tek dokunuşla görev, hatırlatma, not.',size:.085,align:'center',ar:9/16}),
      motion:[{to:0,preset:'float'},{text:'Başlık',fx:'rise',t:.2}]})},
  {id:'turntable',n:'Döner tabla',goal:'video',d:'Telefon kendi çevresinde döner, 1:1',W:900,H:900,dur:6,
    v:v=>({ratio:'1:1',bg:sweep[v],lights:lights[v],settle:true,scene:{rx:-8,ry:0,zoom:.85},devices:[{type:'phone',img:phoneShot(v),colorKey:col(v)}],
      motion:[{to:0,preset:'turn'}]})},
];
const GOALS={land:'Açılış görseli',store:'Mağaza seti',social:'Sosyal',video:'Video'};

export {GOALS,TEMPLATES};
