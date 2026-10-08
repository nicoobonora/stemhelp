import { Worker } from 'node:worker_threads';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, unlink, stat } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { load } from 'cheerio';
import type { CourseStore } from './store.js';
import type { Page, Document } from './types.js';
export function documentPath(directory:string,doc:Document){return join(directory,'materials',doc.id+(doc.kind==='pdf'?'.pdf':'.txt'));}
export async function extractPdf(path:string,progress:(message:string)=>void,signal?:AbortSignal):Promise<{number:number;text:string}[]>{
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new Error('Importazione interrotta.'));return;}
    const worker=new Worker(new URL('./pdf-worker.js',import.meta.url),{workerData:{path}});
    let done=false;
    const timer=setTimeout(()=>end(new Error('Estrazione troppo lunga. Prova un PDF più piccolo.')),240_000);
    function end(error?:Error,pages?:{number:number;text:string}[]){if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);void worker.terminate();if(error)reject(error);else resolve(pages!);}
    const cancel=()=>end(new Error('Importazione interrotta.'));signal?.addEventListener('abort',cancel,{once:true});
    worker.on('message',m=>{if(m.type==='progress')progress(`Lettura pagina ${m.page} di ${m.total}`);if(m.type==='done')end(undefined,m.pages);if(m.type==='error')end(new Error(m.message));});
    worker.on('error',error=>end(error));worker.on('exit',code=>{if(!done)end(new Error(`Lettura PDF interrotta (${code}).`));});
  });
}
export async function importDocument(store:CourseStore,directory:string,courseId:string,path:string,progress:(message:string)=>void,signal?:AbortSignal){
  store.get(courseId);const info=await stat(path);if(!info.isFile()||info.size>100*1024*1024)throw new Error('Scegli un file fino a 100 MB.');
  const extension=extname(path).toLowerCase();if(!['.pdf','.txt','.md'].includes(extension))throw new Error('Sono supportati PDF, TXT e Markdown.');
  const data=await readFile(path);if(extension==='.pdf'&&!data.subarray(0,1024).includes(Buffer.from('%PDF-')))throw new Error('Il file non è un PDF valido.');
  const hash=createHash('sha256').update(data).digest('hex');
  const duplicate=store.documents(courseId).find(d=>d.hash===hash);if(duplicate)return {document:duplicate,duplicate:true};
  const id=randomUUID();const kind=extension==='.pdf'?'pdf':'note';
  const doc:Document={id,courseId,name:basename(path),kind,pages:0,hash,addedAt:new Date().toISOString(),emptyPages:0};
  await mkdir(join(directory,'materials'),{recursive:true});const target=documentPath(directory,doc);
  await writeFile(target,data,{mode:0o600});
  try{
    const extracted=kind==='pdf'?await extractPdf(target,progress,signal):[{number:1,text:data.toString('utf8').slice(0,1_000_000)}];
    const pages:Page[]=extracted.map(p=>({...p,documentId:id}));doc.pages=pages.length;doc.emptyPages=pages.filter(p=>p.text.trim().length<20).length;
    if(signal?.aborted)throw new Error('Importazione interrotta.');
    store.addDocument(doc,pages);return {document:doc,duplicate:false};
  }catch(error){await unlink(target).catch(()=>{});throw error;}
}
export async function readWebSyllabus(address:string,signal?:AbortSignal){
  const url=new URL(address);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('Inserisci un indirizzo HTTP o HTTPS valido.');
  const response=await fetch(url,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(25_000)]):AbortSignal.timeout(25_000),headers:{Accept:'text/html,text/plain'}});
  if(!response.ok)throw new Error(`Pagina non accessibile (${response.status}). Puoi incollare il programma manualmente.`);
  if(!/text\/(html|plain)/i.test(response.headers.get('content-type')||''))throw new Error('La pagina non contiene testo HTML. Incolla il programma o importa il PDF.');
  const reader=response.body!.getReader();let size=0;const chunks:Uint8Array[]=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>5_000_000)throw new Error('Pagina troppo grande: incolla il testo del programma.');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
  const html=Buffer.concat(chunks).toString('utf8');const $=load(html);$('script,style,noscript,nav,header,footer,aside,form,svg').remove();$('br').replaceWith('\n');$('p,li,h1,h2,h3,h4,section,tr').append('\n');
  const content=$('main').length?$('main').text():$('article').length?$('article').text():$('body').text();
  const text=content.replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n\n').trim().slice(0,100_000);
  if(text.length<80)throw new Error('Non riesco a estrarre il programma. La pagina potrebbe richiedere accesso o JavaScript: incollalo manualmente.');
  return {text,url:response.url,fetchedAt:new Date().toISOString()};
}
