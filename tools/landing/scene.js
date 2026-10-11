// Landing page render scene. Env: SPEC (JSON): a template-like object (ratio is replaced by the custom W×H),
// each device may carry img: '/landing-src/<name>.png' (served by the dev server from the project root). Run with EXPORT=1 so the background
// (transparent / solid / gradient) goes through the real export path.
module.exports=async(app,{env,W,H})=>{
  const st=app('state'),spec=JSON.parse(env.SPEC);
  st.customW=W;st.customH=H;
  app('applyTemplate')(Object.assign({ratio:'custom',bg:{bg:'transparent'},lights:'Yumuşak tavan'},spec));
  const load=src=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('image '+src));i.src=src;});
  for(let i=0;i<st.devices.length;i++){const d=st.devices[i],s=spec.devices[i];
    if(s.img){d.img=await load(s.img);d.imgName='ekran.png';app('setScreenTexture')(d);}
    if(s.glare===false)d.glare=false;}
  if(spec.settle)app('settleDevices')();
  Object.assign(st.scene,spec.scene||{});
  app('refit')();app('applyTransform')();app('layout')();app('req')();
};
