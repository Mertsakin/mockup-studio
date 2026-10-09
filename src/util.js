import * as THREE from 'three';

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const D2R=Math.PI/180,V3=THREE.Vector3;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const wrap=v=>((v+180)%360+360)%360-180;
const mkCanvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
function roundRect(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();}
function rng(seed){let s=seed>>>0||1;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return (s>>>0)/4294967296;};}

export {$,$$,D2R,V3,clamp,mkCanvas,rng,roundRect,wrap};
