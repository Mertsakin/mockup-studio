import {applyPalette,GIFEncoder,quantize} from 'gifenc';
import {ArrayBufferTarget,Muxer} from 'webm-muxer';
import {bitrate,mp4Encoder} from './mp4.js';

/* Video files from frames: one interface for the animation export (export/video.js) — enc = await encoderFor(format,
   W, H, fps, {alpha}); await enc.add(canvas, i) per frame; blob = await enc.finish(); enc.close() on abort.
   - mp4: H.264 (mp4.js), no alpha.
   - webm: VP9 through WebCodecs (VP8 where VP9 is missing) into webm-muxer; with alpha 'keep' where the browser
     encodes it, so a transparent board stays transparent (enc.alpha tells; webmAlpha() asks ahead). Chrome 13x
     does not (isConfigSupported says no for every codec), and webm-muxer writes BlockAdditions only for subtitles,
     so a separately encoded alpha stream cannot be attached either: the board gets white there.
   - gif: gifenc, a palette per frame (256 colours, rgba4444 with one-bit alpha on a transparent board), the frame
     delay rounded to GIF's 10 ms ticks; meant for short loops at small sizes (export/video.js caps it). */
const FORMATS={
  mp4:{n:'MP4',ext:'mp4',mime:'video/mp4',d:'H.264, her yerde oynar'},
  webm:{n:'WebM',ext:'webm',mime:'video/webm',d:'VP9, web sayfaları için küçük dosya'},
  gif:{n:'GIF',ext:'gif',mime:'image/gif',d:'kısa döngüler; en çok 720 px, 15 fps'},
};

async function webmEncoder(W,H,fps,wantAlpha){
  if(typeof VideoEncoder==='undefined')throw new Error('codec');
  let config=null,codec=null,alpha=false;
  const tries=[];
  if(wantAlpha)tries.push(['vp09.00.40.08','V_VP9',true],['vp8','V_VP8',true]);
  tries.push(['vp09.00.40.08','V_VP9',false],['vp8','V_VP8',false]);
  for(const [c,mc,a] of tries){
    const cfg={codec:c,width:W,height:H,bitrate:bitrate(W,H,fps),framerate:fps};if(a)cfg.alpha='keep';
    try{const r=await VideoEncoder.isConfigSupported(cfg);if(r.supported){config=r.config;codec=mc;alpha=a;break;}}catch(e){/* next */}
  }
  if(!config)throw new Error('codec');
  const target=new ArrayBufferTarget();
  const muxer=new Muxer({target,video:{codec,width:W,height:H,frameRate:fps,alpha},firstTimestampBehavior:'offset'});
  let failed=null;
  const enc=new VideoEncoder({output:(chunk,meta)=>muxer.addVideoChunk(chunk,meta),error:e=>{failed=e;}});
  enc.configure(config);
  return {
    alpha,
    async add(source,i){
      if(failed)throw failed;
      const f=new VideoFrame(source,{timestamp:Math.round(i*1e6/fps),duration:Math.round(1e6/fps),alpha:alpha?'keep':'discard'});
      enc.encode(f,{keyFrame:i%(fps*2)===0});f.close();
      while(enc.encodeQueueSize>2)await new Promise(r=>setTimeout(r,2));
    },
    async finish(){await enc.flush();if(failed)throw failed;muxer.finalize();enc.close();return new Blob([target.buffer],{type:'video/webm'});},
    close(){try{if(enc.state!=='closed')enc.close();}catch(e){/* closed */}}
  };
}

function gifEncoder(W,H,fps,alpha){
  const gif=GIFEncoder(),c=document.createElement('canvas');c.width=W;c.height=H;
  const g=c.getContext('2d',{willReadFrequently:true}),delay=Math.round(100/fps)*10,format=alpha?'rgba4444':'rgb565';
  return {
    alpha,
    async add(source){
      g.clearRect(0,0,W,H);g.drawImage(source,0,0,W,H);
      const {data}=g.getImageData(0,0,W,H);
      const palette=quantize(data,256,{format,oneBitAlpha:alpha}),index=applyPalette(data,palette,format);
      const ti=alpha?palette.findIndex(p=>p[3]===0):-1;
      gif.writeFrame(index,W,H,{palette,delay,transparent:ti>=0,transparentIndex:Math.max(0,ti),dispose:alpha?2:-1});
      await new Promise(r=>setTimeout(r,0));
    },
    async finish(){gif.finish();return new Blob([gif.bytes()],{type:'image/gif'});},
    close(){}
  };
}

// whether this browser can encode a transparent WebM (asked once)
let alphaP=null;
const webmAlpha=()=>alphaP||(alphaP=(async()=>{if(typeof VideoEncoder==='undefined')return false;
  for(const c of ['vp09.00.40.08','vp8'])try{if((await VideoEncoder.isConfigSupported({codec:c,width:640,height:640,bitrate:2e6,framerate:30,alpha:'keep'})).supported)return true;}catch(e){/* next */}
  return false;})());
async function encoderFor(format,W,H,fps,{alpha=false}={}){
  if(format==='webm')return webmEncoder(W,H,fps,alpha);
  if(format==='gif')return gifEncoder(W,H,fps,alpha);
  const e=await mp4Encoder(W,H,fps);e.alpha=false;return e;
}
// a rough file size (bytes) for the dialog's estimate
const estimate=(format,W,H,fps,dur)=>format==='gif'?W*H*fps*dur*.12:bitrate(W,H,fps)*dur/8;

export {FORMATS,encoderFor,estimate,webmAlpha};
