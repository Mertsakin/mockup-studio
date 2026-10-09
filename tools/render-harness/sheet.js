// Tiles PNGs into one contact sheet (box-downscaled to a common cell height).
// Usage: node tools/render-harness/sheet.js <out.png> <cols> <cellHeight> a.png b.png …
// Tip: pass before/after pairs with cols=2 for a side-by-side comparison.
const fs=require('fs'),{PNG}=require('pngjs');
const [,,out,colsS,cellS,...files]=process.argv;
const cols=+colsS,ch=+cellS,imgs=files.map(f=>PNG.sync.read(fs.readFileSync(f)));
const cw=Math.max(...imgs.map(i=>Math.round(i.width*ch/i.height))),gap=6,rows=Math.ceil(imgs.length/cols);
const S=new PNG({width:cols*cw+(cols+1)*gap,height:rows*ch+(rows+1)*gap});S.data.fill(255);
imgs.forEach((im,n)=>{const ox=gap+(n%cols)*(cw+gap),oy=gap+Math.floor(n/cols)*(ch+gap),s=im.height/ch,w=Math.round(im.width/s);
  for(let y=0;y<ch;y++)for(let x=0;x<w;x++){const acc=[0,0,0];let c=0;
    // at least one source pixel per cell (upscaling would otherwise leave empty rows / columns)
    for(let yy=Math.floor(y*s);yy<Math.max(Math.floor(y*s)+1,Math.floor((y+1)*s));yy++)for(let xx=Math.floor(x*s);xx<Math.max(Math.floor(x*s)+1,Math.floor((x+1)*s));xx++){const i=(yy*im.width+xx)*4;acc[0]+=im.data[i];acc[1]+=im.data[i+1];acc[2]+=im.data[i+2];c++;}
    const o=((oy+y)*S.width+ox+x)*4;for(let k=0;k<3;k++)S.data[o+k]=acc[k]/c;S.data[o+3]=255;}});
fs.writeFileSync(out,PNG.sync.write(S));console.log('wrote',out);
