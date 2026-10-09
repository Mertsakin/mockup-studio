// Built-in composition by index (COMPS). Env: C (index, default 4 = desk set), COLOR, PRESET.
module.exports=async(app,{env})=>{
  const st=app('state');app('applyComp')(app('COMPS')[+(env.C||4)]);
  st.devices.forEach(d=>{d.colorKey=env.COLOR||'silver';app('applyColorTo')(app('RT').get(d.id).mats,d);});
  if(env.PRESET)app('applyLightPreset')(app('LIGHT_PRESETS')[+env.PRESET]);
  st.ratio='16:9';app('layout')();
};
