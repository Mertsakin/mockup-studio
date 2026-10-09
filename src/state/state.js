import * as THREE from 'three';
import {V3} from '../util.js';

let uid=0;
// restored projects carry their own ids: new devices must continue after them
const reserveDeviceIds=max=>{uid=Math.max(uid,max);};
function newDevice(type,o){
  return Object.assign({id:++uid,type,landscape:false,notch:'hole',backFinish:'matte',lidAngle:112,colorKey:'graphite',custom:'#7a5cff',
    fit:'cover',screenBg:'#000000',glare:true,finish:null,px:0,py:0,pz:0,rx:0,ry:0,rz:0,scale:1,
    img:null,imgName:'',scroll:0,siteUrl:'',frameImg:null,frameName:'',screenRect:null,url:'siteadi.com',theme:'light',winRatio:'16:10',pageRatio:'3:4'},o||{});
}
const state={
  scene:{rx:-6,ry:26,rz:0,zoom:1,fov:28,panX:0,panY:0},
  devices:[],selected:null,mode:'rotate',gizmo:'translate',
  bg:'gradient',solid:'#eef1f4',bg1:'#dfe6ff',bg2:'#f4dcea',pattern:'shards',pbase:'#0d0e11',paccent:'#c8202b',
  floor:true,wall:false,wallGap:.35,selfShadow:true,shadowColor:'#000000',shadowOpacity:.55,ambient:1,exposure:1,markers:true,showDome:true,lights:[],selLight:null,
  ratio:'4:5',customW:1920,customH:1080,size:2160,format:'png',quality:'fast',photoPreview:false
};
state.devices=[newDevice('phone')];state.selected=state.devices[0].id;
const byId=id=>state.devices.find(d=>d.id===id);
const sel=()=>byId(state.selected)||state.devices[0];
// Framing shared by transforms, lights, layout and export (reassigned, so kept on an object).
const view={fitRadius:10,fitBox:new THREE.Box3(new V3(-5,-5,-5),new V3(5,5,5)),aspect:1};

export {byId,newDevice,reserveDeviceIds,sel,state,view};
