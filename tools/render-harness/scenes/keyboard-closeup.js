// Keyboard close-up. Env: RX, RY, ZOOM, PANX, PANY, COLOR, PRESET.
module.exports=async(app)=>{
  const st=app('state');
  app('applyComp')({n:'x',items:[{type:'laptop'}],scene:{rx:+(process.env.RX||55),ry:+(process.env.RY||-20),rz:0}});
  const d=st.devices[0];d.colorKey=process.env.COLOR||'silver';app('applyColorTo')(app('RT').get(d.id).mats,d);
  if(process.env.PRESET)app('applyLightPreset')(app('LIGHT_PRESETS')[+process.env.PRESET]);
  st.scene.zoom=+(process.env.ZOOM||2.6);st.scene.panY=+(process.env.PANY||0.1);st.scene.panX=+(process.env.PANX||0);
  st.ratio='4:5';app('layout')();
};
