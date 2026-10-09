import * as THREE from 'three';
import {flatRR,mesh,slab} from './geometry.js';
import {M} from './materials.js';

function buildBrowser(m,d){
  const g=new THREE.Group(),[a,b]=d.winRatio.split(':').map(Number),W=32,ch=W*b/a,bar=1.9,H=ch+bar,D=.22,R=.55;
  g.add(mesh(slab(W,H,R,D,.06),m.frame));
  const barMesh=mesh(flatRR(W-.02,bar,[R-.01,R-.01,0,0]),m.chrome);barMesh.position.set(0,H/2-bar/2,D/2+.002);g.add(barMesh);
  const sw=W-.02,sh=ch;
  // bar and page meet mid-window: only the corners on the outline are rounded (outer radius - 0.1 mm edge)
  const sr=[0,0,R-.01,R-.01];
  const scr=mesh(flatRR(sw,sh,sr),m.screen);scr.position.set(0,-H/2+ch/2,D/2+.003);g.add(scr);
  const glare=mesh(flatRR(sw,sh,sr),M.glare);glare.position.copy(scr.position);glare.position.z+=.001;g.add(glare);
  return {group:g,screen:scr,glare,sw,sh,rotatable:false,chromeW:W,chromeBar:bar};
}

export {buildBrowser};
