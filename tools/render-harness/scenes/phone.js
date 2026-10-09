// Single phone. Env: RX, RY (150 = back view), ZOOM, COLOR, FIN, PRESET.
module.exports=async(app)=>{
  const st=app('state');
  app('applyComp')({n:'x',items:[{type:'phone'}],scene:{rx:+(process.env.RX||-10),ry:+(process.env.RY||150),rz:0}});
  const d=st.devices[0];d.colorKey=process.env.COLOR||'silver';if(process.env.FIN)d.finish=process.env.FIN;
  app('applyColorTo')(app('RT').get(d.id).mats,d);
  if(process.env.PRESET)app('applyLightPreset')(app('LIGHT_PRESETS')[+process.env.PRESET]);
  st.scene.zoom=+(process.env.ZOOM||1);st.ratio='4:5';app('layout')();
};
