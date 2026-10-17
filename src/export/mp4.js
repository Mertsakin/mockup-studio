import {ArrayBufferTarget,Muxer} from 'mp4-muxer';

/* H.264 MP4 encoding with WebCodecs + mp4-muxer, shared by the animation export (export/video.js) and the screen
   recording (ui/record.js). pickConfig finds the first supported AVC level for the size; mp4Encoder takes canvases
   (or anything VideoFrame accepts) frame by frame at a fixed rate and returns the finished file as a Blob. */
const BPP=.16;  // bits per pixel per frame
const bitrate=(w,h,fps)=>Math.round(w*h*fps*BPP);

async function pickConfig(w,h,fps){
  if(typeof VideoEncoder==='undefined')return null;
  for(const codec of ['avc1.640034','avc1.640033','avc1.64002a','avc1.4d0034','avc1.42003e']){
    const c={codec,width:w,height:h,bitrate:bitrate(w,h,fps),framerate:fps,avc:{format:'avc'}};
    try{const r=await VideoEncoder.isConfigSupported(c);if(r.supported)return r.config;}catch(e){/* next */}
  }
  return null;
}

// enc = await mp4Encoder(W, H, fps); await enc.add(canvas, i) per frame (i = frame index); blob = await enc.finish(); enc.close() on abort
async function mp4Encoder(W,H,fps){
  const config=await pickConfig(W,H,fps);
  if(!config)throw new Error('codec');
  const target=new ArrayBufferTarget();
  const muxer=new Muxer({target,video:{codec:'avc',width:W,height:H,frameRate:fps},fastStart:'in-memory',firstTimestampBehavior:'offset'});
  let failed=null;
  const enc=new VideoEncoder({output:(chunk,meta)=>muxer.addVideoChunk(chunk,meta),error:e=>{failed=e;}});
  enc.configure(config);
  return {
    async add(source,i){
      if(failed)throw failed;
      const f=new VideoFrame(source,{timestamp:Math.round(i*1e6/fps),duration:Math.round(1e6/fps)});
      enc.encode(f,{keyFrame:i%(fps*2)===0});f.close();
      while(enc.encodeQueueSize>2)await new Promise(r=>setTimeout(r,2));
    },
    async finish(){
      await enc.flush();if(failed)throw failed;
      muxer.finalize();enc.close();
      return new Blob([target.buffer],{type:'video/mp4'});
    },
    close(){try{if(enc.state!=='closed')enc.close();}catch(e){/* closed */}}
  };
}

export {bitrate,mp4Encoder,pickConfig};
