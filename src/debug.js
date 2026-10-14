import * as THREE from 'three';

// Dev-only (imported from main.js behind import.meta.env.DEV): lets the render harness reach
// any exported name as window.__app('name'). Never part of a production build.
export async function exposeModules(){
  const mods=await Promise.all(Object.values(import.meta.glob(['./**/*.js','!./main.js','!./debug.js'])).map(load=>load()));
  mods.push({THREE});
  window.__app=name=>{
    for(const m of mods)if(name in m)return m[name];
    throw new Error('app(): no module exports '+name);
  };
}
