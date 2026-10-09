import * as THREE from 'three';
import {flatRR,hole,mesh,onSide} from '../geometry.js';
import {M} from '../materials.js';
import {V3} from '../../util.js';

function phoneDetails(g,m,W,H,D,R){
  // antenna bands crossing the frame
  const band=(w,h,dpt,x,y)=>{const b=mesh(new THREE.BoxGeometry(w,h,dpt),m.band);b.position.set(x,y,0);g.add(b);};
  [-1,1].forEach(sx=>{band(.03,.13,D*.62,sx*(W/2+.004),H/2-R-.55);band(.03,.13,D*.62,sx*(W/2+.004),-H/2+R+.55);});
  [-1,1].forEach(sx=>{band(.13,.03,D*.62,sx*(W/2-R-.45),H/2+.004);band(.13,.03,D*.62,sx*(W/2-R-.45),-H/2-.004);});
  // bottom: charge port, speaker & mic holes
  const by=-H/2-.006;
  g.add(onSide(hole(.86,.27,.135),'y',-1,new V3(0,by,0)));
  g.add(onSide(hole(.7,.15,.075,M.portIn),'y',-1,new V3(0,by-.002,0)));
  for(let i=0;i<6;i++){[-1,1].forEach(sx=>{const c=mesh(new THREE.CircleGeometry(.05,16),M.hole);g.add(onSide(c,'y',-1,new V3(sx*(1.05+i*.19),by,0)));});}
  // top mic, SIM tray groove on the left side
  g.add(onSide(mesh(new THREE.CircleGeometry(.04,12),M.hole),'y',1,new V3(1.6,H/2+.006,0)));
  const tray=onSide(hole(.34,2.4,.17),'x',-1,new V3(-W/2-.005,-1.2,0));g.add(tray);
  const trayIn=onSide(mesh(flatRR(.27,2.32,.13),m.frame),'x',-1,new V3(-W/2-.007,-1.2,0));g.add(trayIn);
  g.add(onSide(mesh(new THREE.CircleGeometry(.045,12),M.hole),'x',-1,new V3(-W/2-.009,-.2,0)));
}

export {phoneDetails};
