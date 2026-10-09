import * as THREE from 'three';
import {V3} from '../util.js';

let uid=0;
function newDevice(type,o){
  return Object.assign({id:++uid,type,landscape:false,notch:'hole',lidAngle:112,colorKey:'graphite',custom:'#7a5cff',
    fit:'cover',screenBg:'#000000',glare:true,finish:null,px:0,py:0,pz:0,rx:0,ry:0,rz:0,scale:1,
    img:null,imgName:'',frameImg:null,frameName:'',screenRect:null,url:'siteadi.com',theme:'light',winRatio:'16:10'},o||{});
}
const state={
  scene:{rx:-6,ry:26,rz:0,zoom:1,fov:28,panX:0,panY:0},
  devices:[],selected:null,mode:'rotate',
  bg:'gradient',solid:'#eef1f4',bg1:'#dfe6ff',bg2:'#f4dcea',
  floor:true,wall:false,wallGap:.35,selfShadow:true,shadowColor:'#000000',shadowOpacity:.55,ambient:1,exposure:1,markers:true,showDome:true,lights:[],selLight:null,
  ratio:'4:5',size:2160,format:'png',quality:'fast'
};
state.devices=[newDevice('phone')];state.selected=state.devices[0].id;
const byId=id=>state.devices.find(d=>d.id===id);
const sel=()=>byId(state.selected)||state.devices[0];
// Framing shared by transforms, lights, layout and export (reassigned, so kept on an object).
const view={fitRadius:10,fitBox:new THREE.Box3(new V3(-5,-5,-5),new V3(5,5,5)),aspect:1};

export {byId,newDevice,sel,state,view};
