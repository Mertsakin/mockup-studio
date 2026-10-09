// Pixel diff of two PNGs of equal size. Usage: node tools/render-harness/diff.js a.png b.png [diff.png]
// Prints max channel difference and how many pixels differ; optionally writes an amplified diff image.
const fs=require('fs'),{PNG}=require('pngjs');
const [,,pa,pb,outPath]=process.argv;
const a=PNG.sync.read(fs.readFileSync(pa)),b=PNG.sync.read(fs.readFileSync(pb));
if(a.width!==b.width||a.height!==b.height){console.log('size differs',a.width+'x'+a.height,b.width+'x'+b.height);process.exit(1);}
const out=new PNG({width:a.width,height:a.height});let max=0,n=0;
for(let i=0;i<a.data.length;i+=4){let m=0;for(let k=0;k<3;k++)m=Math.max(m,Math.abs(a.data[i+k]-b.data[i+k]));
  if(m>max)max=m;if(m>2)n++;const v=Math.min(255,m*8);out.data[i]=v;out.data[i+1]=v;out.data[i+2]=v;out.data[i+3]=255;}
console.log((max===0?'identical':'max diff '+max+', '+n+' px > 2')+'  '+pb);
if(outPath)fs.writeFileSync(outPath,PNG.sync.write(out));
process.exit(max>2?1:0);
