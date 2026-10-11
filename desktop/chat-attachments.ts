import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { nativeImage } from 'electron';
import { extractPdf } from './documents.js';
export interface ChatAttachment {id:string;name:string;kind:'text'|'image';text?:string;image?:string;warning?:string}
export const attachmentInfo=(files:ChatAttachment[])=>files.map(({id,name,kind,warning})=>({id,name,kind,warning}));
export async function readChatAttachment(path:string,signal:AbortSignal):Promise<ChatAttachment>{
  const info=await stat(path);if(!info.isFile()||info.size>20*1024*1024)throw new Error('Allegati: massimo 20 MB per file.');
  signal.throwIfAborted();const extension=extname(path).toLowerCase(),data=await readFile(path);const base={id:randomUUID(),name:basename(path)};
  if(['.png','.jpg','.jpeg','.webp'].includes(extension)){
    let image=nativeImage.createFromBuffer(data);if(image.isEmpty())throw new Error('Immagine non valida.');
    const size=image.getSize();if(Math.max(size.width,size.height)>2000)image=image.resize(size.width>=size.height?{width:2000}:{height:2000});
    signal.throwIfAborted();return {...base,kind:'image',image:'data:image/jpeg;base64,'+image.toJPEG(85).toString('base64')};
  }
  let text='',warning='';
  if(extension==='.pdf'){
    if(!data.subarray(0,1024).includes(Buffer.from('%PDF-')))throw new Error('PDF non valido.');
    const pages=await extractPdf(path,()=>{},signal);
    if(!pages.some(p=>p.text.trim()))throw new Error('PDF senza testo leggibile. Allega le pagine come immagini PNG o JPEG.');
    if(pages.some(p=>!p.text.trim()))warning='Alcune pagine non contengono testo leggibile; allegale come immagini se necessarie.';
    text=pages.map(p=>`Pagina ${p.number}\n${p.text}`).join('\n\n');
  }else if(['.txt','.md','.csv'].includes(extension)){text=data.toString('utf8');if(text.includes('\0'))throw new Error('Il file non è un documento di testo.');}
  else throw new Error('Usa PDF, TXT, Markdown, CSV, PNG, JPEG o WebP.');
  if(text.length>80000)throw new Error('Allegato troppo lungo per la chat (massimo 80.000 caratteri). Dividilo in file più piccoli.');
  if(!text.trim())throw new Error('Il file è vuoto.');signal.throwIfAborted();return {...base,kind:'text',text,warning};
}
