/* PNG without an alpha channel (24-bit RGB). Store listings ask for it (Google Play: "24-bit PNG, no transparency";
   App Store Connect rejects screenshots with alpha), but canvas.toBlob always writes RGBA. The image is flattened
   (callers paint an opaque background first), each row gets the Sub filter and the browser's CompressionStream does
   the zlib deflate. */
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(bytes){let c=0xffffffff;for(let i=0;i<bytes.length;i++)c=CRC[(c^bytes[i])&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function chunk(type,data){
  const out=new Uint8Array(12+data.length),dv=new DataView(out.buffer);
  dv.setUint32(0,data.length);for(let i=0;i<4;i++)out[4+i]=type.charCodeAt(i);out.set(data,8);
  dv.setUint32(8+data.length,crc32(out.subarray(4,8+data.length)));return out;
}
async function deflate(raw){
  const s=new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
// canvas -> Blob (image/png, colour type 2)
async function png24(canvas){
  const w=canvas.width,h=canvas.height,px=canvas.getContext('2d').getImageData(0,0,w,h).data,stride=w*3+1;
  const raw=new Uint8Array(h*stride);
  for(let y=0;y<h;y++){
    const o=y*stride,s=y*w*4;raw[o]=1;  // Sub: each byte minus the same channel of the pixel to its left
    for(let x=0;x<w;x++){const i=s+x*4,j=o+1+x*3;
      for(let c=0;c<3;c++)raw[j+c]=(px[i+c]-(x?px[i+c-4]:0))&255;}
  }
  const ihdr=new Uint8Array(13),dv=new DataView(ihdr.buffer);
  dv.setUint32(0,w);dv.setUint32(4,h);ihdr[8]=8;ihdr[9]=2;  // 8 bits, RGB; compression, filter, interlace 0
  const sig=new Uint8Array([137,80,78,71,13,10,26,10]);
  return new Blob([sig,chunk('IHDR',ihdr),chunk('IDAT',await deflate(raw)),chunk('IEND',new Uint8Array(0))],{type:'image/png'});
}

export {png24};
