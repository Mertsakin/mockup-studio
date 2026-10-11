// Single laptop. Env: COLOR (silver|graphite|white|navy|sage|coral), PRESET (light preset index), FIN (finish key),
// BG (solid background colour, e.g. '#2a2e35', or 'transparent'), FLOOR (1/0), RATIO (default 4:5).
module.exports=async(app,{env})=>{
  const st=app('state');
  app('applyComp')({n:'x',items:[{type:'laptop'}],scene:{rx:18,ry:-28,rz:0}});
  const d=st.devices[0];d.colorKey=env.COLOR||'silver';if(env.FIN)d.finish=env.FIN;
  app('applyColorTo')(app('RT').get(d.id).mats,d);
  if(env.PRESET)app('applyLightPreset')(app('LIGHT_PRESETS')[+env.PRESET]);
  if(env.BG==='transparent')st.bg='transparent';else if(env.BG){st.bg='solid';st.solid=env.BG;}
  if(env.FLOOR!==undefined)st.floor=env.FLOOR==='1';
  st.ratio=env.RATIO||'4:5';app('layout')();
};
