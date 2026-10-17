// Imported 3D model next to a phone: a small GLB is built in the page (GLTFExporter: PBR metal, clearcoat, a textured
// box and glass), loaded through the real import path (devices/model.js) and placed on the phone's floor.
// Env: COLOR (phone), PRESET (light set-up), SIZE (model's longest edge, cm; default 14.7), RY (scene turn),
//      GLB (path of a .glb to use instead of the generated one; read by the harness into window.__glb).
module.exports=async(app,{env})=>{
  const st=app('state'),THREE=app('THREE');
  app('applyComp')({n:'x',items:[{type:'phone'}],scene:{rx:-8,ry:+(env.RY||22),rz:0}});
  const d=st.devices[0];d.colorKey=env.COLOR||'graphite';app('applyColorTo')(app('RT').get(d.id).mats,d);
  if(env.PRESET)app('applyLightPreset')(app('LIGHT_PRESETS')[+env.PRESET]);
  let file;
  if(window.__glb){file=new File([Uint8Array.from(atob(window.__glb),c=>c.charCodeAt(0))],'ornek.glb',{type:'model/gltf-binary'});}
  else{
    const {GLTFExporter}=await import('/node_modules/three/examples/jsm/exporters/GLTFExporter.js');
    const g=new THREE.Group();
    const knot=new THREE.Mesh(new THREE.TorusKnotGeometry(.3,.1,160,24),new THREE.MeshPhysicalMaterial({color:0xc9a44c,metalness:1,roughness:.25}));
    knot.position.set(0,.45,0);g.add(knot);
    const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');
    for(let i=0;i<8;i++)for(let j=0;j<8;j++){x.fillStyle=(i+j)%2?'#2b7de9':'#f2f4f7';x.fillRect(i*32,j*32,32,32);}
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
    const box=new THREE.Mesh(new THREE.BoxGeometry(1,.2,1),new THREE.MeshStandardMaterial({map:tex,roughness:.6}));
    box.position.set(0,-.1,0);g.add(box);
    const paint=new THREE.Mesh(new THREE.SphereGeometry(.18,48,32),new THREE.MeshPhysicalMaterial({color:0xd0342c,roughness:.3,clearcoat:1,clearcoatRoughness:.05}));
    paint.position.set(-.32,.18,.32);g.add(paint);
    const glass=new THREE.Mesh(new THREE.SphereGeometry(.16,48,32),new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.02,transmission:1,thickness:.3,ior:1.5}));
    glass.position.set(.34,.16,.3);g.add(glass);
    const buf=await new GLTFExporter().parseAsync(g,{binary:true});
    file=new File([buf],'ornek.glb',{type:'model/gltf-binary'});
  }
  const a=await app('loadModelFile')(file);
  app('doc').assets.push({img:a,name:a.name});app('renderAssets')();
  const m=app('addModel')(a);
  m.modelSize=+(env.SIZE||14.7);m.px=d.px+11;m.ry=-28;app('applyTransform')();
  // both on one floor, the camera framing both
  app('settleDevices')();app('refit')();st.scene.zoom=1;app('applyTransform')();
  st.ratio='4:5';app('layout')();
};
