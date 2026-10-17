// Lenses and depth of field: a phone in front (in focus), a laptop behind it, a second phone further back.
// Env: MM (focal length, full-frame equivalent, default 50), F (f-number; 0 or empty: no depth of field),
// BLADES (aperture blades, 0: round), MODE ('target' (default) | 'frame' | 'dist': the focus mode),
// FOCUS ('front' | 'back': the target device in 'target' mode), FX / FY (the frame point in 'frame' mode, fractions,
// default .5 / .5), DIST (the focus distance in cm in 'dist' mode; default: the front phone's current depth),
// PULL=1 (dist mode: a focus pull, keys from the front phone at 0 s to the laptop at 2 s) with T (the time rendered, s).
module.exports=async(app,{env})=>{
  const st=app('state');
  app('applyComp')({n:'x',items:[{type:'laptop',pz:-14,ry:8},{type:'phone',px:6,py:-2.45,pz:12,ry:-18},{type:'phone',px:-24,py:-2.45,pz:-40,ry:24,colorKey:'coral'}],scene:{rx:8,ry:-10,rz:0}});
  st.bg='gradient';st.bg1='#e9e6ff';st.bg2='#ffe8ef';st.ratio='4:5';
  st.scene.fov=app('fovFromMm')(+(env.MM||50));st.scene.zoom=+(env.ZOOM||2.2);st.scene.panY=-.05;
  const front=st.devices[1],back=st.devices[2],mode=env.MODE||'target';
  st.scene.fnum=+env.F||2.8;
  const focus=mode==='frame'?{frame:[+(env.FX||.5),+(env.FY||.5)]}:mode==='dist'?{dist:true}:{dev:(env.FOCUS==='back'?back:front).id};
  st.dof=+env.F>0?{on:true,blades:+(env.BLADES||0),focus,bg:true}:null;
  app('applyTransform')();
  if(mode==='dist'){st.scene.focusDist=env.DIST?+env.DIST:+app('deviceDepth')(front).toFixed(1);app('applyTransform')();}
  if(mode==='dist'&&env.PULL){
    const lap=st.devices[0],a=+app('deviceDepth')(front).toFixed(1),b=+app('deviceDepth')(lap).toFixed(1);
    st.scene.tracks={focusDist:[{t:0,v:a,ease:'smooth'},{t:2,v:b,ease:'smooth'}]};
    app('setMode')('animate');app('seek')(+(env.T||0));
  }
  app('layout')();
  console.log('focus mode '+mode+': '+app('focusDistance')().toFixed(1)+' cm');
};
