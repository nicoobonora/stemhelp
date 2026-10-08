import { useCallback, useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions, TextLayer, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'pdfjs-dist/web/pdf_viewer.css';
import { api, type Document } from './api';
import { Icon, RichText, Spinner } from './components';
GlobalWorkerOptions.workerSrc=workerUrl;
export interface PageSnapshot {documentId:string;page:number;image?:string;selection:string;ready:boolean}
function PdfPage({pdf,number,width,zoom,ratio,root,onReady,onError}:{pdf:PDFDocumentProxy;number:number;width:number;zoom:number;ratio:number;root:HTMLDivElement|null;onReady:(page:number,image?:string)=>void;onError:(message:string)=>void}){
  const sheet=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),text=useRef<HTMLDivElement>(null);
  const [near,setNear]=useState(false),[aspect,setAspect]=useState(ratio),[rendering,setRendering]=useState(false);
  useEffect(()=>{if(!root||!sheet.current)return;const observer=new IntersectionObserver(entries=>setNear(entries[0].isIntersecting),{root,rootMargin:'800px 0px'});observer.observe(sheet.current);return()=>observer.disconnect();},[root]);
  useEffect(()=>{
    if(!near)return;
    let active=true,task:RenderTask|undefined,layer:TextLayer|undefined;
    const element=canvas.current!,container=text.current!;setRendering(true);onReady(number);
    (async()=>{
      const item=await pdf.getPage(number);if(!active)return;
      const natural=item.getViewport({scale:1});setAspect(natural.width/natural.height);
      const scale=width/natural.width*zoom,viewport=item.getViewport({scale}),pixelRatio=Math.min(devicePixelRatio||1,2);
      element.width=Math.floor(viewport.width*pixelRatio);element.height=Math.floor(viewport.height*pixelRatio);element.style.width=viewport.width+'px';element.style.height=viewport.height+'px';
      container.replaceChildren();container.style.setProperty('--scale-factor',String(scale));container.style.setProperty('--total-scale-factor',String(scale));container.style.width=viewport.width+'px';container.style.height=viewport.height+'px';
      task=item.render({canvas:element,viewport,transform:[pixelRatio,0,0,pixelRatio,0,0]});await task.promise;if(!active)return;
      const content=await item.getTextContent();if(!active)return;layer=new TextLayer({textContentSource:content,container,viewport});await layer.render();if(!active)return;
      const thumb=document.createElement('canvas'),factor=Math.min(1,1600/element.width);thumb.width=element.width*factor;thumb.height=element.height*factor;thumb.getContext('2d')!.drawImage(element,0,0,thumb.width,thumb.height);
      onReady(number,thumb.toDataURL('image/jpeg',.84));
    })().catch(e=>{if(active&&e.name!=='RenderingCancelledException')onError('Impossibile visualizzare la pagina: '+e.message);}).finally(()=>{if(active)setRendering(false);});
    return()=>{active=false;task?.cancel();layer?.cancel();onReady(number);element.width=0;element.height=0;container.replaceChildren();};
  },[pdf,number,width,zoom,near,onReady]);
  return <div ref={sheet} className="pdf-sheet continuous-page" data-page={number} aria-label={`Pagina ${number}`} style={{width:width*zoom,height:width*zoom/aspect}}>{near&&<><canvas ref={canvas}/><div ref={text} className="textLayer"/>{rendering&&<span className="page-loading"><Spinner/></span>}</>}</div>;
}
export function PdfViewer({documents,documentId,page,onNavigate,onSnapshot,onError}:{documents:Document[];documentId:string;page:number;onNavigate:(id:string,page:number)=>void;onSnapshot:(snapshot:PageSnapshot)=>void;onError:(message:string)=>void}){
  const [pdf,setPdf]=useState<PDFDocumentProxy|null>(null),[note,setNote]=useState(''),[loading,setLoading]=useState(false),[zoom,setZoom]=useState(1),[width,setWidth]=useState(600),[draftPage,setDraftPage]=useState(String(page)),[ratio,setRatio]=useState(1.414);
  const holder=useRef<HTMLDivElement>(null),snapshot=useRef<PageSnapshot>({documentId,page,selection:'',ready:false}),images=useRef(new Map<number,string>()),scrolledPage=useRef<number|null>(null),current=useRef({documentId,page,onSnapshot,onNavigate,onError});
  current.current={documentId,page,onSnapshot,onNavigate,onError};
  const doc=documents.find(d=>d.id===documentId);
  const changeSnapshot=(s:PageSnapshot)=>{snapshot.current=s;current.current.onSnapshot(s);};
  const ready=useCallback((number:number,image?:string)=>{if(current.current.documentId!==documentId)return;if(image)images.current.set(number,image);else images.current.delete(number);if(current.current.page===number)changeSnapshot({documentId:current.current.documentId,page:number,image,selection:'',ready:!!image});},[documentId]);
  useEffect(()=>{setDraftPage(String(page));if(doc?.kind==='pdf')changeSnapshot({documentId,page,image:images.current.get(page),selection:snapshot.current.documentId===documentId&&snapshot.current.page===page?snapshot.current.selection:'',ready:images.current.has(page)});},[page,documentId]);
  useEffect(()=>{const observer=new ResizeObserver(entries=>setWidth(Math.max(250,entries[0].contentRect.width-48)));if(holder.current)observer.observe(holder.current);return()=>observer.disconnect();},[]);
  useEffect(()=>{
    let active=true,loadingTask:ReturnType<typeof getDocument>|undefined;
    setPdf(null);setNote('');setLoading(!!documentId);images.current.clear();scrolledPage.current=null;changeSnapshot({documentId,page,selection:'',ready:false});
    if(documentId)api('documents.read',documentId).then(async result=>{
      if(!active)return;
      if(result.kind==='note'){setNote(result.text);changeSnapshot({documentId,page:1,selection:'',ready:true});return;}
      const base=new URL('./pdf-assets/',document.baseURI).href;
      loadingTask=getDocument({data:new Uint8Array(result.data),cMapUrl:base+'cmaps/',cMapPacked:true,standardFontDataUrl:base+'standard_fonts/',wasmUrl:base+'wasm/',useSystemFonts:true});
      const loaded=await loadingTask.promise;const first=await loaded.getPage(1);if(active){const size=first.getViewport({scale:1});setRatio(size.width/size.height);setPdf(loaded);}
    }).catch(e=>{if(active)onError(e.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;void loadingTask?.destroy();};
  },[documentId]);
  useEffect(()=>{
    if(!pdf||!holder.current)return;
    if(scrolledPage.current===page){scrolledPage.current=null;return;}
    const target=holder.current.querySelector<HTMLElement>(`[data-page="${page}"]`);
    if(target)holder.current.scrollTop+=target.getBoundingClientRect().top-holder.current.getBoundingClientRect().top-24;
  },[pdf,page]);
  const trackPage=()=>{
    const box=holder.current;if(!pdf||!box)return;
    const bounds=box.getBoundingClientRect();
    const sheets=Array.from(box.querySelectorAll<HTMLElement>('[data-page]'));
    if(box.scrollHeight<=box.clientHeight+1)return;
    let number=1,best=-1;
    if(box.scrollTop+box.clientHeight>=box.scrollHeight-2)number=pdf.numPages;
    else for(const sheet of sheets){const rect=sheet.getBoundingClientRect();const visible=Math.max(0,Math.min(rect.bottom,bounds.bottom)-Math.max(rect.top,bounds.top));if(visible>best){best=visible;number=Number(sheet.dataset.page);}}
    if(number&&number!==current.current.page){scrolledPage.current=number;current.current.onNavigate(documentId,number);}
  };
  return <div className="viewer">
    <div className="viewer-bar"><Icon name="file"/><select aria-label="Documento aperto" value={documentId} onChange={e=>onNavigate(e.target.value,1)}>{!documents.length&&<option value="">Nessun materiale</option>}{documents.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select><button className="icon-button" title="Riduci" disabled={zoom<=.6} onClick={()=>setZoom(z=>Math.max(.6,z-.2))}>−</button><button className="zoom" title="Adatta alla larghezza" onClick={()=>setZoom(1)}>{Math.round(zoom*100)}%</button><button className="icon-button" title="Ingrandisci" disabled={zoom>=2} onClick={()=>setZoom(z=>Math.min(2,z+.2))}>+</button></div>
    <div className="pdf-scroll" ref={holder} onScroll={trackPage} onMouseUp={()=>{const selection=window.getSelection();if(!selection?.rangeCount||!selection.toString().trim())return;const range=selection.getRangeAt(0);if(!holder.current?.contains(range.commonAncestorContainer))return;const node=range.startContainer.nodeType===Node.ELEMENT_NODE?range.startContainer as Element:range.startContainer.parentElement;const number=Number(node?.closest('[data-page]')?.getAttribute('data-page'))||page;if(number!==page){scrolledPage.current=number;onNavigate(documentId,number);}changeSnapshot({documentId,page:number,image:images.current.get(number),ready:doc?.kind==='note'||images.current.has(number),selection:selection.toString().trim().slice(0,15000)});}}>
      {loading&&<div className="loading"><Spinner/> Apertura documento</div>}
      {!documentId&&<div className="empty"><Icon name="file" size={26}/><h3>Le tue slide, qui.</h3><p>Aggiungi PDF o appunti nella sezione Materiali.</p></div>}
      {doc?.kind==='note'&&<div className="note-page"><RichText text={note}/></div>}
      {pdf&&Array.from({length:pdf.numPages},(_,i)=><PdfPage key={documentId+':'+(i+1)} pdf={pdf} number={i+1} width={width} zoom={zoom} ratio={ratio} root={holder.current} onReady={ready} onError={onError}/>)}
    </div>
    <div className="viewer-footer"><span>{doc?.kind==='pdf'?'Seleziona un passaggio per discuterne':'Appunti'}</span>{doc&&<div className="pagination"><button className="icon-button" aria-label="Pagina precedente" disabled={page<=1||loading} onClick={()=>onNavigate(documentId,page-1)}><Icon name="back" size={14}/></button><input aria-label="Numero pagina" value={draftPage} onChange={e=>setDraftPage(e.target.value)} onBlur={()=>{const n=Number(draftPage);if(Number.isInteger(n)&&n>=1&&n<=doc.pages)onNavigate(documentId,n);else setDraftPage(String(page));}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/><span>/ {doc.pages}</span><button className="icon-button" aria-label="Pagina successiva" disabled={page>=doc.pages||loading} onClick={()=>onNavigate(documentId,page+1)}><Icon name="chevron" size={14}/></button></div>}</div>
  </div>;
}
