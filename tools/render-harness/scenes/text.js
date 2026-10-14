// Text layers (store-visual style): a phone on a gradient, a headline + subtitle over it and a large word behind it.
// Env: BG ('dark' | 'light'), RATIO (default 9:16). Use EXPORT=1: the export composites the text (the raw render does not).
module.exports=async(app,{env})=>{
  const st=app('state'),dark=env.BG!=='light';
  app('applyComp')({n:'x',items:[{type:'phone'}],scene:{rx:-4,ry:-18,rz:0}});
  st.bg='gradient';st.gradType='linear';st.gradAngle=160;
  if(dark){st.bg1='#1b1f3a';st.bg2='#4a2a6b';}else{st.bg1='#f4f1ea';st.bg2='#dfe7f5';}
  st.ratio=env.RATIO||'9:16';st.scene.panY=-.08;app('layout')();
  const ink=dark?'#ffffff':'#14161c',add=app('addText');
  add({name:'Arka plan',text:'FOCUS',font:'Bebas Neue',weight:400,size:.42,y:.56,color:dark?'#ffffff':'#14161c',opacity:.08,front:false});
  add({name:'Başlık',text:'Odaklan,\ndaha çok iş bitir',font:'Plus Jakarta Sans',weight:800,size:.085,y:.12,color:ink,lh:1.05,ls:-.02});
  add({name:'Alt başlık',text:'Görevlerini, takvimini ve notlarını tek bir sade uygulamada topla.',font:'Inter',weight:500,size:.034,y:.235,
    wrap:22,lh:1.35,color:dark?'#c9c6e6':'#5a5f6b'});
  add({name:'Rozet',text:'YENİ · ÜCRETSİZ DENE',font:'Inter',weight:700,size:.026,y:.93,ls:.12,fill:'gradient',color:'#ff8a5b',color2:'#ff4fa3',shadow:.4});
  app('layout')();
};
