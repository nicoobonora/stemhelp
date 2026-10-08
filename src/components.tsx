import { useEffect, useRef, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { api } from './api';
import 'katex/dist/katex.min.css';
export function Icon({name,size=18}:{name:string;size?:number}){
  const paths:Record<string,ReactNode>={
    book:<><path d="M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4zM20 4h-4a3 3 0 0 0-3 3v14a4 4 0 0 1 4-2h3z"/></>,
    plus:<path d="M12 5v14M5 12h14"/>,chevron:<path d="m9 5 7 7-7 7"/>,back:<path d="m14 5-7 7 7 7"/>,close:<path d="m6 6 12 12M6 18 18 6"/>,
    file:<><path d="M5 3h9l5 5v13H5zM14 3v6h5M8 13h8M8 17h6"/></>,settings:<><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="15" cy="17" r="3" fill="currentColor"/></>,
    upload:<><path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/></>,check:<path d="m5 12 4 4 10-10"/>,dots:<><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    arrow:<path d="M5 12h14m-6-6 6 6-6 6"/>,send:<path d="M12 20V4m-6 6 6-6 6 6"/>,trash:<><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></>,
    edit:<><path d="m4 16-1 5 5-1L20 8l-4-4zM13 7l4 4"/></>,search:<><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></>,logout:<><path d="M9 4H4v16h5M10 12h11m-4-4 4 4-4 4"/></>,tree:<><path d="M7 4v15h11M7 10h11"/><circle cx="18" cy="10" r="2"/><circle cx="18" cy="19" r="2"/><circle cx="7" cy="4" r="2"/></>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]||paths.file}</svg>;
}
export function Modal({title,children,onClose,wide=false}:{title:string;children:ReactNode;onClose:()=>void;wide?:boolean}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=ref.current!;dialog.showModal();return()=>dialog.close();},[]);
  return <dialog ref={ref} className={`modal ${wide?'wide':''}`} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===ref.current){const r=ref.current!.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose();}}}><header className="modal-head"><h2>{title}</h2><button aria-label="Chiudi" className="icon-button" onClick={onClose}><Icon name="close"/></button></header>{children}</dialog>;
}
export function RichText({text,onSource}:{text:string;onSource?:(id:string,page:number)=>void}){
  const normalized=text.replace(/\\\[([\s\S]*?)\\\]/g,(_,m)=>`\n$$${m}$$\n`).replace(/\\\(([\s\S]*?)\\\)/g,(_,m)=>`$${m}$`);
  return <div className="rich"><Markdown remarkPlugins={[remarkGfm,remarkMath]} rehypePlugins={[rehypeKatex]} urlTransform={url=>/^(https?:|study:|#)/.test(url)?url:''} components={{a:({href,children})=><a href={href} onClick={e=>{e.preventDefault();if(href?.startsWith('study://document/')){const [,doc,page]=href.match(/^study:\/\/document\/([^/]+)\/(\d+)$/)||[];if(doc)onSource?.(doc,Number(page));}else if(href?.startsWith('http'))void api('link.open',href).catch(()=>{});}}>{children}</a>,img:()=>null}}>{normalized}</Markdown></div>;
}
export function Empty({title,children,action}:{title:string;children:ReactNode;action?:ReactNode}){return <div className="empty"><Icon name="book" size={28}/><h3>{title}</h3><p>{children}</p>{action}</div>;}
export function Spinner(){return <span className="spinner" aria-label="In corso"/>;}
