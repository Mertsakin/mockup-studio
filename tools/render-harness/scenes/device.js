// Any single device. Env: TYPE (phone|tablet|monitor|laptop…), RX, RY, ZOOM, COLOR, FIN, PRESET, RATIO.
module.exports=async(app,{env})=>{
  const st=app('state');
  app('applyComp')({n:'x',items:[{type:env.TYPE||'phone'}],scene:{rx:+(env.RX||10),ry:+(env.RY||-28),rz:0}});
  const d=st.devices[0];d.colorKey=env.COLOR||'silver';if(env.FIN)d.finish=env.FIN;
  app('applyColorTo')(app('RT').get(d.id).mats,d);
  if(env.PRESET)app('applyLightPreset')(app('LIGHT_PRESETS')[+env.PRESET]);
  st.scene.zoom=+(env.ZOOM||1);st.ratio=env.RATIO||'4:5';app('layout')();
};
