// One light of a given modifier on a phone, to check each light type (directional / spot / point).
// Env: MOD (sun | softbox | flash | bulb …, default bulb), INT (intensity), AZ, EL, DIST, RY.
module.exports=async(app,{env})=>{
  const st=app('state');
  app('applyComp')({n:'x',items:[{type:'phone'}],scene:{rx:-8,ry:+(env.RY||30),rz:0}});
  const d=st.devices[0];d.colorKey='silver';app('applyColorTo')(app('RT').get(d.id).mats,d);
  app('applyLightPreset')({ambient:.45,lights:[{mod:env.MOD||'bulb',intensity:+(env.INT||1.4),az:+(env.AZ||-35),el:+(env.EL||38),dist:+(env.DIST||1.6)}]});
  st.ratio='4:5';app('layout')();
};
