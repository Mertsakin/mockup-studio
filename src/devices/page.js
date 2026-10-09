import * as THREE from 'three';
import {flatRR,innerRadii,mesh,slab} from './geometry.js';
import {M} from './materials.js';

/* "Sade ekran": a frameless floating screen (web page, app screen) — a thin rounded card that is all display.
   Long side 28 cm; d.pageRatio sets the shape. */
function buildPage(m,d){
  const [a,b]=d.pageRatio.split(':').map(Number),L=28,W=a>=b?L:L*a/b,H=a>=b?L*b/a:L,D=.12,R=.5,edge=.03;
  const g=new THREE.Group();
  g.add(mesh(slab(W,H,R,D,.04),m.frame));
  const sw=W-2*edge,sh=H-2*edge,sr=innerRadii(R,edge,edge,edge,edge);
  const scr=mesh(flatRR(sw,sh,sr),m.screen);scr.position.z=D/2+.002;g.add(scr);
  const glare=mesh(flatRR(sw,sh,sr),M.glare);glare.position.z=D/2+.004;g.add(glare);
  return {group:g,screen:scr,glare,sw,sh,rotatable:false};
}

export {buildPage};
