import {createCanvas,loadImage} from '@napi-rs/canvas';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const image=await loadImage(readFileSync('assets/icon.svg'));
const canvas=createCanvas(1024,1024);canvas.getContext('2d').drawImage(image,0,0,1024,1024);writeFileSync('assets/icon.png',canvas.toBuffer('image/png'));
if(process.platform==='darwin'){
  mkdirSync('assets/icon.iconset',{recursive:true});
  for(const size of [16,32,128,256,512])for(const scale of [1,2]){const c=createCanvas(size*scale,size*scale);c.getContext('2d').drawImage(image,0,0,size*scale,size*scale);writeFileSync(`assets/icon.iconset/icon_${size}x${size}${scale===2?'@2x':''}.png`,c.toBuffer('image/png'));}
  execFileSync('iconutil',['-c','icns','assets/icon.iconset','-o','assets/icon.icns']);
}
