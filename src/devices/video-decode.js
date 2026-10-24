import {setScreenFrame} from './screen.js';
import {showFrame,wantedTime} from './video.js';

/* Screen-video frames for the video export, decoded with WebCodecs instead of seeking the <video> element.
   A seek costs tens to hundreds of milliseconds a frame and jitters (video.js showFrame sets currentTime and waits
   for 'seeked'); a decoder walking the stream in order hands out the next frame in a few milliseconds. mediabunny
   demuxes the file (MP4, QuickTime, WebM, Matroska; MPL-2.0; ~68 KB gzipped once tree-shaken to the reading side; the
   successor of the mp4-muxer / webm-muxer packages the export already writes with) and feeds a VideoDecoder:
   sink.samples(t) yields the frame shown at t and then every following one, decoding four ahead. One stream per
   screen video: frameAt(t) keeps the current sample and one look-ahead and advances while the next sample starts by
   t; a wanted time before the current frame (the loop wrapping back to videoT0) restarts the stream at the key frame
   before t. The sample goes to the screen texture as it is (screen.js setScreenFrame draws it with the sample's own
   draw(), so the file's rotation and flip are honoured) and the previous one is closed; between two frames the
   texture does not change, so the motion blur sub-samples see one still frame. The <video> element is not touched
   during the export; close() puts the screens back on it.
   Loaded on first use (dynamic import; the names are destructured right on the import so the bundler keeps only the
   reading side, not the muxers and encoders): only a video export with a screen video pays for it.
   Fallback: no VideoDecoder (or window.__noWebCodecs = true), an unknown container, a codec this browser cannot
   decode or a decode error mid-way put that device back on the seek path (showFrame), with one console.warn. */
const EPS=1e-6;
let warned=false;
const warn=(d,why)=>{if(warned)return;warned=true;console.warn('Ekran videosu ('+(d.videoName||'video')+') WebCodecs ile çözülemedi, seek yoluna dönüldü:',why&&why.message||why);};
const available=()=>!window.__noWebCodecs&&typeof VideoDecoder!=='undefined'&&typeof VideoFrame!=='undefined';

// a frame stream for one <video>: frameAt(t) (video seconds) -> the VideoSample shown at t (owned here) | null; close()
async function openStream(v){
  const {Input,BlobSource,MP4,QTFF,WEBM,MATROSKA,VideoSampleSink}=await import('mediabunny');
  const blob=await (await fetch(v.src)).blob();
  const input=new Input({source:new BlobSource(blob),formats:[MP4,QTFF,WEBM,MATROSKA]});
  let track;
  try{track=await input.getPrimaryVideoTrack();if(track&&!(await track.canDecode()))track=null;}catch(e){input.dispose();throw e;}
  if(!track){input.dispose();throw new Error('bu dosya ya da kodek çözülemiyor');}
  const sink=new VideoSampleSink(track);
  let it=null,cur=null,next=null,at=-Infinity;
  const drop=s=>{if(s)try{s.close();}catch(e){/* closed */}};
  const reset=async()=>{const i=it;it=null;drop(cur);drop(next);cur=next=null;if(i)await i.return();};
  return {
    async frameAt(t){
      if(it&&t<at-EPS)await reset();  // time went back (the loop wrapped): restart at the key frame before t
      if(!it){it=sink.samples(t)[Symbol.asyncIterator]();const r=await it.next();cur=r.done?null:r.value;next=null;}
      for(;;){  // advance while the following frame already starts by t (one look-ahead)
        if(!next){const r=await it.next();if(r.done)break;next=r.value;}
        if(next.timestamp<=t+EPS){drop(cur);cur=next;next=null;}else break;
      }
      at=t;return cur;
    },
    async close(){await reset();input.dispose();}
  };
}

/* The export's frame source for the given video devices: await screens.show(t) once per exported frame (t: artboard
   seconds, or a function of the device), screens.close() when done. A device whose stream cannot be opened, or
   fails mid-way, is served by the seek path. */
async function openExportFrames(devices){
  const list=[];
  for(const d of devices){
    let s=null;
    if(!available())warn(d,'VideoDecoder yok ya da kapalı');
    else try{s=await openStream(d.video);}catch(e){warn(d,e);}
    list.push({d,s});
  }
  const giveUp=async e=>{const s=e.s;e.s=null;setScreenFrame(e.d,null);if(s)await s.close().catch(()=>{});};
  return {
    show(t){
      return Promise.all(list.map(async e=>{
        const d=e.d,tt=typeof t==='function'?t(d):t;
        if(e.s){
          try{const f=await e.s.frameAt(wantedTime(d,tt));if(f){setScreenFrame(d,f);return;}}
          catch(err){warn(d,err);}
          await giveUp(e);
        }
        await showFrame(d,tt);
      }));
    },
    async close(){for(const e of list)await giveUp(e);}
  };
}

export {openExportFrames};
