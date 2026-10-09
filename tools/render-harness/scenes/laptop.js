// Single laptop. Env: COLOR (silver|graphite|white|navy|sage|coral), PRESET (light preset index), FIN (finish key).
module.exports=async(app)=>{
  const st=app('state');
  app('applyComp')({n:'x',items:[{type:'laptop'}],scene:{rx:18,ry:-28,rz:0}});
  const d=st.devices[0];d.colorKey=process.env.COLOR||'silver';if(process.env.FIN)d.finish=process.env.FIN;
  app('applyColorTo')(app('RT').get(d.id).mats,d);
  if(process.env.PRESET)app('applyLightPreset')(app('LIGHT_PRESETS')[+process.env.PRESET]);
  st.ratio='4:5';app('layout')();
};
