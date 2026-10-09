// Logic test for light dragging: picks the light sphere, drags it, maps a light-map point. Prints values; also renders.
module.exports=async(app,{W,H})=>{
  const st=app('state');app('applyLightPreset')(app('LIGHT_PRESETS')[3]);
  st.scene.zoom=.45;app('layout')();
  const L=st.lights[0],o=app('LRT').get(L.id),cam=app('camera');
  const v=o.marker.position.clone().project(cam),sx=(v.x+1)/2*W,sy=(1-v.y)/2*H;
  console.log('before az/el',L.az.toFixed(1),L.el.toFixed(1));
  console.log('picked',app('pickLight')(sx,sy)===L.id);
  app('dragLight3D')(L.id,sx-200,sy);
  await new Promise(r=>setTimeout(r,30));
  console.log('after az/el',L.az.toFixed(1),L.el.toFixed(1));
  app('setFromDome')(L,{x:70,y:0});console.log('map x=70 -> az',L.az.toFixed(1),'el',L.el.toFixed(1));
  app('applyTransform')();
};
