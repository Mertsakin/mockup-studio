import * as THREE from 'three';
import {lightTan} from '../lights/mods.js';
import {renderer,req,scene} from './renderer.js';
import {state} from '../state/state.js';
import {D2R,V3,mkCanvas} from '../util.js';

/* ---------- studio environment (reflections) ---------- */
const pmrem=new THREE.PMREMGenerator(renderer);
const envScene=new THREE.Scene();
const roomMat=new THREE.MeshBasicMaterial({side:THREE.BackSide});
roomMat.map=(function(){const c=mkCanvas(4,256),g=c.getContext('2d'),gr=g.createLinearGradient(0,0,0,256);
  gr.addColorStop(0,'#e6e8ec');gr.addColorStop(.42,'#aeb3ba');gr.addColorStop(.5,'#7d828a');gr.addColorStop(.56,'#4c5058');gr.addColorStop(1,'#2a2c31');
  g.fillStyle=gr;g.fillRect(0,0,4,256);const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return t;})();
envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10,48,24),roomMat));
const envLights=new THREE.Group();envScene.add(envLights);
function panelTex(kind){
  const c=mkCanvas(256,256),g=c.getContext('2d');
  if(kind==='window'){g.fillStyle='#fff';g.fillRect(0,0,256,256);g.fillStyle='#222';g.fillRect(122,0,12,256);g.fillRect(0,122,256,12);
    g.fillRect(0,0,256,8);g.fillRect(0,248,256,8);g.fillRect(0,0,8,256);g.fillRect(248,0,8,256);}
  else{const rad=kind==='soft';const gr=rad?g.createRadialGradient(128,128,10,128,128,128):g.createRadialGradient(128,128,0,128,128,128);
    if(rad){gr.addColorStop(0,'#ffffff');gr.addColorStop(.7,'#e8e8e8');gr.addColorStop(.92,'#bdbdbd');gr.addColorStop(1,'#000');}
    else{gr.addColorStop(0,'#fff');gr.addColorStop(.5,'#fff');gr.addColorStop(1,'#000');}
    g.fillStyle=gr;g.fillRect(0,0,256,256);}
  const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return t;
}
const PANEL_TEX={soft:panelTex('soft'),hot:panelTex('hot'),window:panelTex('window')};
let envSig='',envTimer=null,envRT=null;
function envSignature(){return state.ambient.toFixed(2)+'|'+state.lights.map(L=>[L.mod,L.type,L.az,L.el,L.dist,L.size,L.intensity,L.color].join(',')).join(';');}
function rebuildEnv(){
  envLights.children.slice().forEach(m=>{envLights.remove(m);m.geometry.dispose();m.material.dispose();});
  roomMat.color.setScalar(.25+.75*state.ambient);
  state.lights.forEach(L=>{
    const az=L.az*D2R,el=L.el*D2R,dir=new V3(Math.cos(el)*Math.sin(az),Math.sin(el),Math.cos(el)*Math.cos(az)),dist=8.5;
    const tan=lightTan(L),w=Math.max(.3,Math.min(14,dist*tan));let geo,kind='soft',val=3.2*L.intensity;
    switch(L.mod){
      case 'sun':geo=new THREE.CircleGeometry(.35,24);kind='hot';val=26*L.intensity;break;
      case 'overcast':geo=new THREE.CircleGeometry(Math.min(9,w/2),40);val=1.6*L.intensity;break;
      case 'window':geo=new THREE.PlaneGeometry(w,w*1.3);kind='window';val=2.6*L.intensity;break;
      case 'strip':geo=new THREE.PlaneGeometry(w*.3,w*1.5);break;
      case 'softbox':geo=new THREE.PlaneGeometry(w*1.25,w*.85);break;
      case 'octa':geo=new THREE.CircleGeometry(w/2,8);break;
      case 'umbrella':geo=new THREE.CircleGeometry(w/2,16);val=2.6*L.intensity;break;
      case 'flash':case 'reflector':case 'bulb':geo=new THREE.CircleGeometry(Math.max(.25,w/2),24);kind='hot';val=10*L.intensity;break;
      case 'dish':geo=new THREE.CircleGeometry(w/2,32);val=4.5*L.intensity;break;
      default:geo=new THREE.PlaneGeometry(w,w);
    }
    const mat=new THREE.MeshBasicMaterial({map:PANEL_TEX[kind],side:THREE.DoubleSide});
    mat.color.set(L.color).convertSRGBToLinear().multiplyScalar(val);
    const p=new THREE.Mesh(geo,mat);p.position.copy(dir.multiplyScalar(dist));p.lookAt(0,0,0);envLights.add(p);
  });
  const old=envRT;envRT=pmrem.fromScene(envScene,0.02,.1,50);scene.environment=envRT.texture;if(old)old.dispose();
  envSig=envSignature();req();
}
function scheduleEnv(now){
  if(envSignature()===envSig)return;
  clearTimeout(envTimer);if(now)rebuildEnv();else envTimer=setTimeout(rebuildEnv,140);
}

export {scheduleEnv};
