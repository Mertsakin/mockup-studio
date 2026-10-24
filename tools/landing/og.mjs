// The social sharing image (og:image, 1200 x 630) from the hero video's poster: resized to 1200 wide, the middle cut
// out. node tools/landing/og.mjs -> landing/img/og.jpg (the site build copies it to /img/og.jpg).
import sharp from 'sharp';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
const W=1200,H=630,src=path.join(ROOT,'landing/video/hero.jpg'),out=path.join(ROOT,'landing/img/og.jpg');
const meta=await sharp(src).metadata();
const h=Math.round(meta.height*W/meta.width);
await sharp(src).resize(W,h).extract({left:0,top:Math.max(0,Math.round((h-H)/2)),width:W,height:Math.min(H,h)}).jpeg({quality:88,mozjpeg:true}).toFile(out);
console.log('og.jpg',W+'x'+H,'from',meta.width+'x'+meta.height);
