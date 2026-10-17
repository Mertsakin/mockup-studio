import {setScreenTexture} from './screen.js';
import {designT} from '../state/anim.js';
import {state} from '../state/state.js';

/* Video on a device screen (v1: silent). d.video is an HTMLVideoElement (muted, inline, blob URL); the frame shown is a
   pure function of the artboard time: video time = d.videoT0 + (d.videoLoop ? t mod rest : min(t, rest)), rest being
   what is left of the video after the trim start. The editor shows the playhead's frame in Canlandır and the device's
   design frame (the poster frame) in Tasarla; the still export and the thumbnails are that poster frame too.
   d.videoPoster (seconds of video, null = not set) overrides the poster: Tasarla shows that second whatever the
   time mapping; Canlandır ignores it.
   Seeking is asynchronous: showFrame(d, t) remembers the wanted time and pumps the video's seeks one at a time
   (a new target while one is in flight replaces the pending one), redrawing the screen texture after each 'seeked'.
   The video export awaits the returned promise, so every frame is exact. While the timeline plays, the videos play
   themselves (followVideos keeps them within DRIFT s of the playhead and redraws every frame); stopping seeks back to
   the exact frame. */
const EPS=1/60,DRIFT=.12,MAX_MB=200;
const hasVideo=d=>!!(d&&d.video);
const videoDevices=()=>state.devices.filter(hasVideo);
const duration=v=>Number.isFinite(v.duration)&&v.duration>0?v.duration:0;
// video time for artboard time t (seconds)
function videoTime(d,t){
  const v=d.video,dur=duration(v),t0=Math.max(0,Math.min(dur?dur-EPS:0,d.videoT0||0));
  if(!dur)return Math.max(0,t0+t);  // unknown duration (streams): no wrap, no clamp
  const rest=Math.max(EPS,dur-t0);
  let u=Math.max(0,t);
  u=d.videoLoop!==false?u%rest:Math.min(u,rest-EPS);
  return Math.min(dur-EPS,t0+u);
}
// the frame a device shows outside playback: the playhead in Canlandır (set by ui/animate.js), else its design frame
let clock=null;  // () => number | null
const setVideoClock=fn=>{clock=fn;};
const shownTime=d=>{const t=clock?clock():null;return t==null?designT(d):t;};
const inDesign=()=>!clock||clock()==null;
// the poster second (video time) a device shows in Tasarla: its own, else the design frame's mapping
const posterTime=d=>{const v=d.video,dur=duration(v),p=d.videoPoster;if(p==null||!Number.isFinite(p))return videoTime(d,designT(d));return Math.max(0,dur?Math.min(dur-EPS,p):p);};

// one seek: resolves when the frame at t is decodable (false: already there)
function seekTo(v,t){
  const dur=duration(v);if(dur)t=Math.max(0,Math.min(dur-EPS,t));
  if(!v.seeking&&v.readyState>=2&&Math.abs(v.currentTime-t)<1e-3)return Promise.resolve(false);
  return new Promise(res=>{
    let done=false;const fin=ok=>{if(done)return;done=true;v.removeEventListener('seeked',onSeeked);clearTimeout(tm);res(ok);};
    const onSeeked=()=>fin(true),tm=setTimeout(()=>fin(true),1500);  // a stuck seek must not hang the export
    v.addEventListener('seeked',onSeeked);v.currentTime=t;
  });
}
const pumps=new WeakMap();  // video -> {want, p (promise of the pump), drawn}
// shows the video's frame for artboard time t on the device's screen; resolves when it is drawn
function showFrame(d,t){
  const v=d.video;if(!v)return Promise.resolve();
  let s=pumps.get(v);if(!s){s={want:null,p:null};pumps.set(v,s);}
  s.want=inDesign()&&d.videoPoster!=null?posterTime(d):videoTime(d,t);
  if(s.p)return s.p;
  s.p=(async()=>{
    try{
      while(s.want!=null){const w=s.want;s.want=null;const moved=await seekTo(v,w);if(moved||s.drawn!==d.video)setScreenTexture(d);s.drawn=d.video;}
    }finally{s.p=null;}
  })();
  return s.p;
}
// every video device at artboard time t (a number, or a function of the device); resolves when all are drawn
const showFrames=t=>Promise.all(videoDevices().map(d=>showFrame(d,typeof t==='function'?t(d):t)));
// what the editor shows now (mode-dependent)
const showNow=()=>showFrames(shownTime);

/* ---------- playback (the timeline runs): the videos play on their own, the playhead corrects them */
let playing=false;
function playVideos(t){
  playing=true;
  videoDevices().forEach(d=>{const v=d.video;v.loop=false;v.currentTime=videoTime(d,t);v.play().catch(()=>{});});
}
function followVideos(t){
  if(!playing)return;
  videoDevices().forEach(d=>{
    const v=d.video,want=videoTime(d,t),dur=duration(v),atEnd=dur&&want>=dur-2*EPS;
    if(Math.abs(v.currentTime-want)>DRIFT)v.currentTime=want;
    if(v.paused&&!atEnd)v.play().catch(()=>{});
    setScreenTexture(d);
  });
}
function stopVideos(t){
  if(!playing)return;playing=false;
  videoDevices().forEach(d=>{d.video.pause();});
  return showFrames(t);
}

/* ---------- loading */
// any video file goes to the video path (QuickTime .mov screen recordings are mostly H.264, which Chrome plays);
// what the browser cannot decode fails in loadVideo with its own message
const isVideoFile=f=>!!f&&(/^video\//i.test(f.type)||/\.(mp4|m4v|mov|webm)$/i.test(f.name||''));
// a playable, muted, inline video element from a URL (blob / object URL); resolves when its first frame is decodable
function loadVideo(src){
  return new Promise((res,rej)=>{
    const v=document.createElement('video');v.muted=true;v.defaultMuted=true;v.playsInline=true;v.preload='auto';
    const ok=()=>{off();settleDuration(v).then(()=>res(v));},bad=()=>{off();rej(new Error('video'));};
    const off=()=>{v.removeEventListener('loadeddata',ok);v.removeEventListener('error',bad);};
    v.addEventListener('loadeddata',ok);v.addEventListener('error',bad);
    v.src=src;v.load();
  });
}
const videoSize=v=>[v.videoWidth||1,v.videoHeight||1];
const fmtDur=s=>{s=Math.max(0,s||0);const m=Math.floor(s/60),r=s-m*60;return m?m+':'+String(Math.floor(r)).padStart(2,'0'):r.toFixed(1).replace('.',',')+' sn';};

/* Browser recordings (MediaRecorder WebM) and fragmented MP4s report no duration (Infinity) until the browser has
   scanned the file, which happens on the first seek: without this the artboard duration and the trim limits would read
   0 at load time. A seek far past the end makes it compute one (bounded wait), then the video returns to its start. */
function settleDuration(v){
  if(duration(v))return Promise.resolve();
  return new Promise(res=>{
    let done=false;
    const fin=()=>{
      if(done)return;done=true;clearTimeout(to);v.removeEventListener('durationchange',onDur);
      const back=()=>{v.removeEventListener('seeked',back);clearTimeout(to2);res();},to2=setTimeout(back,1000);
      v.addEventListener('seeked',back);try{v.currentTime=0;}catch(e){back();}
    };
    const onDur=()=>{if(duration(v))fin();},to=setTimeout(fin,3000);
    v.addEventListener('durationchange',onDur);
    try{v.currentTime=1e101;}catch(e){fin();}
  });
}

export {DRIFT,MAX_MB,duration,fmtDur,followVideos,hasVideo,isVideoFile,loadVideo,playVideos,posterTime,setVideoClock,showFrame,showFrames,showNow,shownTime,stopVideos,videoDevices,videoSize,videoTime};
