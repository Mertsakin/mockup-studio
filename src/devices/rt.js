import {D2R} from '../util.js';

// Runtime objects per device id: mesh group, materials, size, screen mesh…
const RT=new Map();
function setHolder(o,d){
  o.holder.position.set(d.px,d.py,d.pz);
  o.holder.rotation.set(d.rx*D2R,d.ry*D2R,d.rz*D2R,'YXZ');
  o.holder.scale.setScalar(d.scale);
  o.orient.rotation.z=(o.rotatable&&d.landscape)?Math.PI/2:0;
  if(o.lid)o.lid.rotation.x=-(d.lidAngle-90)*D2R;
}

export {RT,setHolder};
