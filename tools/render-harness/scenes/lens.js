// Lenses and depth of field: a phone in front (in focus), a laptop behind it, a second phone further back.
// Env: MM (focal length, full-frame equivalent, default 50), F (f-number; 0 or empty: no depth of field),
// BLADES (aperture blades, 0: round), FOCUS ('front' | 'back').
module.exports=async(app,{env})=>{
  const st=app('state');
  app('applyComp')({n:'x',items:[{type:'laptop',pz:-14,ry:8},{type:'phone',px:6,py:-2.45,pz:12,ry:-18},{type:'phone',px:-24,py:-2.45,pz:-40,ry:24,colorKey:'coral'}],scene:{rx:8,ry:-10,rz:0}});
  st.bg='gradient';st.bg1='#e9e6ff';st.bg2='#ffe8ef';st.ratio='4:5';
  st.scene.fov=app('fovFromMm')(+(env.MM||50));st.scene.zoom=+(env.ZOOM||2.2);st.scene.panY=-.05;
  const front=st.devices[1],back=st.devices[2];
  st.dof=+env.F>0?{on:true,f:+env.F,blades:+(env.BLADES||0),focus:{dev:(env.FOCUS==='back'?back:front).id},bg:true}:null;
  app('applyTransform')();app('layout')();
};
