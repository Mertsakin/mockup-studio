// Material/reflection sanity check: hides devices, shows three metal spheres (rough 0 / .2 / .6).
module.exports=async(app)=>{
  const T=app('THREE'),sc=app('scene');app('RT').forEach(o=>o.holder.visible=false);
  [[1,0],[1,.2],[1,.6]].forEach(([m,r],i)=>{const s=new T.Mesh(new T.SphereGeometry(3,64,32),new T.MeshPhysicalMaterial({color:0xffffff,metalness:m,roughness:r}));
    s.position.set((i-1)*6.5,0,0);sc.add(s);});
  app('layout')();
};
