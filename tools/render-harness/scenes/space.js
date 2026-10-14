// Uzay (state.env 'space'): no floor, free orbit. Env: ENV ('studio' | 'space'), DRAG ("dx,dy": a trackball drag in
// px at 0.45°/px, like the stage), WORLD (1: the lights turn with the scene). A laptop and a phone, default lights.
module.exports=async(app,{env})=>{
  const st=app('state');
  app('applyComp')({n:'x',items:[{type:'laptop'},{type:'phone',px:17,py:-2.45,pz:7,ry:-16}],scene:{rx:12,ry:-18,rz:0}});
  st.env=env.ENV||'space';st.worldLights=env.WORLD==='1';st.bg='gradient';st.bg1='#141a33';st.bg2='#3b2a66';
  if(env.DRAG){const [dx,dy]=env.DRAG.split(',').map(Number);for(let i=0;i<20;i++)app('orbit')(dx/20,dy/20,.45);}
  st.ratio='4:5';app('applyTransform')();app('layout')();
};
