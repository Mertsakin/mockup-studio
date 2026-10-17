import {DEFAULT_MODEL_CM} from '../state/constants.js';
import {D2R} from '../util.js';

// Runtime objects per device id: mesh group, materials, size, screen mesh…
const RT=new Map();
function setHolder(o,d){
  o.holder.position.set(d.px,d.py,d.pz);
  o.holder.rotation.set(d.rx*D2R,d.ry*D2R,d.rz*D2R,'YXZ');
  o.holder.scale.setScalar(d.scale);
  o.orient.rotation.z=(o.rotatable&&d.landscape)?Math.PI/2:0;
  if(o.lid)o.lid.rotation.x=-(d.lidAngle-90)*D2R;
  if(o.model)fitModel(o,d);
}
// an imported model (devices/model.js): d.modelSize cm on its longest edge, its bounding box centre at the origin
function fitModel(o,d){
  const s=(d.modelSize>0?d.modelSize:DEFAULT_MODEL_CM)/o.asset.long;
  o.fit.scale.setScalar(s);o.fit.position.copy(o.asset.center).multiplyScalar(-s);
}

// the cover glass reflection's amount (0-1.5; 1 = the studio's look; older documents: glare false = 0)
const glareAmt=d=>d.glareAmt??(d.glare===false?0:1);

export {RT,fitModel,setHolder,glareAmt};
