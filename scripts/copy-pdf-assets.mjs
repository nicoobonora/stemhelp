import {cpSync,mkdirSync} from 'node:fs';
mkdirSync('dist/pdf-assets',{recursive:true});
for(const name of ['cmaps','standard_fonts','wasm'])cpSync(`node_modules/pdfjs-dist/${name}`,`dist/pdf-assets/${name}`,{recursive:true});
