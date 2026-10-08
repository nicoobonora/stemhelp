import { parentPort, workerData } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
async function extract(){
  const data=new Uint8Array(await readFile(workerData.path));
  const task=getDocument({data,useSystemFonts:true,disableFontFace:true});
  try{
    const pdf=await task.promise;
    if(pdf.numPages>3000)throw new Error('Il PDF supera il limite di 3000 pagine. Dividilo in plichi più piccoli.');
    const pages=[];
    for(let i=1;i<=pdf.numPages;i++){
      const page=await pdf.getPage(i);const content=await page.getTextContent();
      const text=content.items.map(item=>'str' in item?item.str+('hasEOL' in item&&item.hasEOL?'\n':' '):'').join('').trim();
      pages.push({number:i,text});parentPort?.postMessage({type:'progress',page:i,total:pdf.numPages});page.cleanup();
    }
    parentPort?.postMessage({type:'done',pages});
  }finally{await task.destroy();}
}
extract().catch(error=>parentPort?.postMessage({type:'error',message:error?.name==='PasswordException'?'Il PDF è protetto da password. Importa una copia sbloccata.':error.message}));
