// Built-in composition by index (COMPS). Env: C (index, default 4 = desk set), COLOR, PRESET.
module.exports=async(app)=>{
  const st=app('state');app('applyComp')(app('COMPS')[+(process.env.C||4)]);
  st.devices.forEach(d=>{d.colorKey=process.env.COLOR||'silver';app('applyColorTo')(app('RT').get(d.id).mats,d);});
  if(process.env.PRESET)app('applyLightPreset')(app('LIGHT_PRESETS')[+process.env.PRESET]);
  st.ratio='16:9';app('layout')();
};
