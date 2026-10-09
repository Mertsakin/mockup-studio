/* Ready-made showcase templates. Each is a plain scene description applied by ui/templates.js:
   ratio, scene (camera angle / zoom / pan), bg (background style and colours), floor, lights (preset name),
   settle (line device bottoms up on the floor), devices (newDevice fields). Positions in cm.
   format groups them on the showcases page. Inspired by the user's Figma boards; generic artwork only. */
const DARK={bg:'pattern',pattern:'shards',pbase:'#0d0e11',paccent:'#c8202b'};

const TEMPLATES=[
  // ---- square 1:1 (social posts)
  {id:'gece-paneli',name:'Gece paneli',format:'square',ratio:'1:1',bg:DARK,lights:'Stüdyo',
    scene:{rx:12,ry:-34,zoom:1.7,panX:.16,panY:-.02},devices:[{type:'laptop',colorKey:'graphite',lidAngle:104}]},
  {id:'kontrol-merkezi',name:'Kontrol merkezi',format:'square',ratio:'1:1',bg:DARK,lights:'Stüdyo',
    scene:{rx:34,ry:22,zoom:1.35,panX:-.06,panY:-.02},devices:[{type:'laptop',colorKey:'silver',lidAngle:118}]},
  {id:'yuzen-sayfalar',name:'Yüzen sayfalar',format:'square',ratio:'1:1',
    bg:{bg:'pattern',pattern:'shards',pbase:'#f4f4f6',paccent:'#d22a2a'},lights:'Yumuşak tavan',
    scene:{rx:-4,ry:0,zoom:1.12,panY:-.02},
    devices:[{type:'page',pageRatio:'9:16',colorKey:'white',px:-8.5,pz:-2,ry:22,rx:-6,rz:4},{type:'page',pageRatio:'9:16',colorKey:'white',px:8,py:-4,pz:3,ry:-16,rx:-6,rz:-3}]},
  {id:'panel-telefon',name:'Panel ve telefon',format:'square',ratio:'1:1',
    bg:{bg:'pattern',pattern:'glow',pbase:'#0a0b10',paccent:'#3b2f8f'},lights:'İki softbox',
    scene:{rx:10,ry:-22,zoom:1.2,panY:.02},
    devices:[{type:'laptop',colorKey:'graphite',glare:false},{type:'phone',colorKey:'graphite',px:18,py:-4,pz:7,ry:-18,glare:false}]},
  {id:'telefon-yelpazesi',name:'Telefon yelpazesi',format:'square',ratio:'1:1',
    bg:{bg:'gradient',bg1:'#e9e4ff',bg2:'#ffe3ec'},lights:'Yumuşak tavan',floor:true,
    scene:{rx:-6,ry:0,zoom:1.05},
    devices:[{type:'phone',colorKey:'white',px:-7.6,py:.23,pz:-1.5,ry:18,rz:6},{type:'phone',colorKey:'white',pz:2},{type:'phone',colorKey:'white',px:7.6,py:.23,pz:-1.5,ry:-18,rz:-6}]},
  {id:'masa-duzeni',name:'Masa düzeni',format:'square',ratio:'1:1',bg:{bg:'solid',solid:'#ece9e3'},lights:'Pencere ışığı',floor:true,settle:true,
    scene:{rx:10,ry:0,zoom:1.12},
    devices:[{type:'monitor',colorKey:'silver'},{type:'laptop',colorKey:'silver',px:-31,pz:8,ry:22},{type:'phone',colorKey:'silver',px:27,pz:10,ry:-22}]},
  // ---- portrait 4:5 (portfolio cards)
  {id:'mavi-kart',name:'Mavi kart',format:'portrait',ratio:'4:5',bg:{bg:'solid',solid:'#1d4f9f'},lights:'Stüdyo',
    scene:{rx:-6,ry:14,zoom:1.3,panX:.06,panY:.06},
    devices:[{type:'browser',px:6,py:3,ry:-14},{type:'phone',colorKey:'silver',px:-10,py:-5,pz:7,ry:16}]},
  {id:'gece-telefonlari',name:'Gece telefonları',format:'portrait',ratio:'4:5',bg:{bg:'gradient',bg1:'#2b2b2e',bg2:'#0c0c0e'},lights:'Stüdyo',
    scene:{rx:-6,ry:6,zoom:1.25,panY:-.04},
    devices:[{type:'phone',colorKey:'white',px:-3.6,py:1.5,ry:14,rz:5},{type:'phone',colorKey:'graphite',px:3.8,py:-2,pz:2.5,ry:-10,rz:-3}]},
  {id:'daire-vurgusu',name:'Daire vurgusu',format:'portrait',ratio:'4:5',
    bg:{bg:'pattern',pattern:'circle',pbase:'#f3efe8',paccent:'#e4572e'},lights:'Yumuşak tavan',
    scene:{rx:14,ry:-24,zoom:1.2},devices:[{type:'laptop',colorKey:'silver'}]},
  {id:'lacivert-dizustu',name:'Lacivert dizüstü',format:'portrait',ratio:'4:5',bg:{bg:'solid',solid:'#15203a'},lights:'Dramatik',floor:true,shadowOpacity:.7,
    scene:{rx:16,ry:-30,zoom:1.15},devices:[{type:'laptop',colorKey:'graphite',glare:false}]},
  {id:'krem-tablet',name:'Krem tablet',format:'portrait',ratio:'4:5',bg:{bg:'solid',solid:'#efe6d8'},lights:'Pencere ışığı',floor:true,
    scene:{rx:-6,ry:22,zoom:1.1},devices:[{type:'tablet',colorKey:'white'}]},
  {id:'izgara-telefon',name:'Izgara telefon',format:'portrait',ratio:'4:5',
    bg:{bg:'pattern',pattern:'grid',pbase:'#f6f6f4',paccent:'#1d1d1f'},lights:'Yumuşak tavan',
    scene:{rx:-8,ry:24,zoom:.95},devices:[{type:'phone',colorKey:'graphite'}]},
  {id:'pastel-sayfalar',name:'Pastel sayfalar',format:'portrait',ratio:'4:5',bg:{bg:'gradient',bg1:'#dff1ea',bg2:'#e7e3fb'},lights:'Yumuşak tavan',
    scene:{rx:-10,ry:0,zoom:1.15},
    devices:[{type:'page',pageRatio:'3:4',colorKey:'white',px:-5,py:4,pz:-2,ry:16,rz:3},{type:'page',pageRatio:'3:4',colorKey:'white',px:5,py:-5,pz:2,ry:-12,rz:-2}]},
  {id:'monitor-karti',name:'Monitör kartı',format:'portrait',ratio:'4:5',
    bg:{bg:'pattern',pattern:'glow',pbase:'#101114',paccent:'#2c5c8f'},lights:'İki softbox',
    scene:{rx:6,ry:-18,zoom:1.15},devices:[{type:'monitor',colorKey:'graphite'}]},
  // ---- story 9:16
  {id:'story-kahraman',name:'Story kahraman',format:'story',ratio:'9:16',bg:{bg:'gradient',bg1:'#6b4cff',bg2:'#ff7aa8'},lights:'Stüdyo',
    scene:{rx:-10,ry:26,rz:6,zoom:1.1},devices:[{type:'phone',colorKey:'white',glare:false}]},
  {id:'story-ikili',name:'Story ikili',format:'story',ratio:'9:16',bg:DARK,lights:'Stüdyo',
    scene:{rx:-6,ry:16,zoom:1.05},
    devices:[{type:'tablet',colorKey:'graphite',px:-2,py:6,pz:-3,ry:12,glare:false},{type:'phone',colorKey:'graphite',px:6,py:-10,pz:5,ry:-12,glare:false}]},
  // ---- wide 21:9 (banners)
  {id:'banner-ikili',name:'Banner ikili',format:'wide',ratio:'21:9',
    bg:{bg:'pattern',pattern:'grid',pbase:'#f4f4f2',paccent:'#2a2a2a'},lights:'Stüdyo',
    scene:{rx:12,ry:-14,zoom:1.95,panX:-.02,panY:-.02},
    devices:[{type:'laptop',colorKey:'silver',glare:false},{type:'phone',colorKey:'graphite',px:22,py:-1,pz:6,ry:-20}]},
  {id:'banner-masaustu',name:'Banner masaüstü',format:'wide',ratio:'21:9',
    bg:{bg:'pattern',pattern:'glow',pbase:'#0b0c0f',paccent:'#4b3a96'},lights:'İki softbox',floor:true,settle:true,shadowOpacity:.8,
    scene:{rx:8,ry:0,zoom:1.75},
    devices:[{type:'monitor',colorKey:'graphite'},{type:'laptop',colorKey:'graphite',px:-31,pz:8,ry:22},{type:'phone',colorKey:'graphite',px:27,pz:10,ry:-22}]},
  {id:'banner-dizi',name:'Banner dizi',format:'wide',ratio:'21:9',bg:{bg:'solid',solid:'#f1efe9'},lights:'Yumuşak tavan',floor:true,
    scene:{rx:-6,ry:0,zoom:2.05},
    devices:[-2,-1,0,1,2].map(i=>({type:'phone',colorKey:i%2?'graphite':'silver',px:i*10,pz:-Math.abs(i)*2,ry:-i*8}))},
  // ---- landscape 16:9
  {id:'sunum',name:'Sunum',format:'landscape',ratio:'16:9',bg:{bg:'gradient',bg1:'#eef1f6',bg2:'#dfe4ee'},lights:'Yumuşak tavan',floor:true,
    scene:{rx:14,ry:-20,zoom:1.4},devices:[{type:'laptop',colorKey:'silver'}]}
];
const FORMATS={square:'Kare 1:1',portrait:'Dikey 4:5',story:'Story 9:16',wide:'Banner 21:9',landscape:'Yatay 16:9'};

export {FORMATS,TEMPLATES};
