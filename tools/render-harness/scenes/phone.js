// Single phone. Env: RX, RY (150 = back view), ZOOM, COLOR, FIN, PRESET.
module.exports=async(app,{env})=>{
  const st=app('state');
  app('applyComp')({n:'x',items:[{type:'phone'}],scene:{rx:+(env.RX||-10),ry:+(env.RY||150),rz:0}});
  const d=st.devices[0];d.colorKey=env.COLOR||'silver';if(env.FIN)d.finish=env.FIN;
  app('applyColorTo')(app('RT').get(d.id).mats,d);
  if(env.PRESET)app('applyLightPreset')(app('LIGHT_PRESETS')[+env.PRESET]);
  st.scene.zoom=+(env.ZOOM||1);st.ratio='4:5';app('layout')();
};
