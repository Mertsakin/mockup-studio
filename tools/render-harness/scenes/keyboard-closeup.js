// Keyboard close-up. Env: RX, RY, ZOOM, PANX, PANY, COLOR, PRESET.
module.exports=async(app,{env})=>{
  const st=app('state');
  app('applyComp')({n:'x',items:[{type:'laptop'}],scene:{rx:+(env.RX||55),ry:+(env.RY||-20),rz:0}});
  const d=st.devices[0];d.colorKey=env.COLOR||'silver';app('applyColorTo')(app('RT').get(d.id).mats,d);
  if(env.PRESET)app('applyLightPreset')(app('LIGHT_PRESETS')[+env.PRESET]);
  st.scene.zoom=+(env.ZOOM||2.6);st.scene.panY=+(env.PANY||0.1);st.scene.panX=+(env.PANX||0);
  st.ratio='4:5';app('layout')();
};
