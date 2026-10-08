import { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions, TextLayer, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'pdfjs-dist/web/pdf_viewer.css';
import { api, type Document } from './api';
import { Icon, RichText, Spinner } from './components';
GlobalWorkerOptions.workerSrc=workerUrl;
export interface PageSnapshot {documentId:string;page:number;image?:string;selection:string;ready:boolean}
export function PdfViewer({documents,documentId,page,onNavigate,onSnapshot,onError}:{documents:Document[];documentId:string;page:number;onNavigate:(id:string,page:number)=>void;onSnapshot:(snapshot:PageSnapshot)=>void;onError:(message:string)=>void}){
  const [pdf,setPdf]=useState<PDFDocumentProxy|null>(null),[note,setNote]=useState(''),[loading,setLoading]=useState(false),[rendering,setRendering]=useState(false),[zoom,setZoom]=useState(1),[width,setWidth]=useState(600),[draftPage,setDraftPage]=useState(String(page));
  const holder=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),textLayer=useRef<HTMLDivElement>(null),task=useRef<RenderTask|null>(null),snapshot=useRef<PageSnapshot>({documentId,page,selection:'',ready:false});
  const doc=documents.find(d=>d.id===documentId);
  const changeSnapshot=(s:PageSnapshot)=>{snapshot.current=s;onSnapshot(s);};
  useEffect(()=>{setDraftPage(String(page));},[page]);
  useEffect(()=>{const observer=new ResizeObserver(entries=>setWidth(Math.max(250,entries[0].contentRect.width-48)));if(holder.current)observer.observe(holder.current);return()=>observer.disconnect();},[]);
  useEffect(()=>{
    let active=true;let loaded:PDFDocumentProxy|undefined;let loadingTask:ReturnType<typeof getDocument>|undefined;
    setPdf(null);setNote('');setLoading(!!documentId);changeSnapshot({documentId,page,selection:'',ready:false});
    if(documentId)api('documents.read',documentId).then(async result=>{
      if(!active)return;
      if(result.kind==='note'){setNote(result.text);changeSnapshot({documentId,page:1,selection:'',ready:true});return;}
      const base=new URL('./pdf-assets/',document.baseURI).href;
      loadingTask=getDocument({data:new Uint8Array(result.data),cMapUrl:base+'cmaps/',cMapPacked:true,standardFontDataUrl:base+'standard_fonts/',wasmUrl:base+'wasm/',useSystemFonts:true});
      loaded=await loadingTask.promise;if(active)setPdf(loaded);
    }).catch(e=>{if(active)onError(e.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;task.current?.cancel();void loadingTask?.destroy();};
  },[documentId]);
  useEffect(()=>{
    if(!pdf||!canvas.current||!textLayer.current)return;
    let active=true;let layer:TextLayer|undefined;const element=canvas.current;const layerElement=textLayer.current;
    setRendering(true);changeSnapshot({documentId,page,selection:'',ready:false});
    task.current?.cancel();layerElement.innerHTML='';
    (async()=>{
      const item=await pdf.getPage(page);if(!active)return;
      const natural=item.getViewport({scale:1});const scale=width/natural.width*zoom;const viewport=item.getViewport({scale});const ratio=Math.min(window.devicePixelRatio||1,2);
      element.width=Math.floor(viewport.width*ratio);element.height=Math.floor(viewport.height*ratio);element.style.width=viewport.width+'px';element.style.height=viewport.height+'px';
      layerElement.style.setProperty('--scale-factor',String(scale));layerElement.style.setProperty('--total-scale-factor',String(scale));layerElement.style.width=viewport.width+'px';layerElement.style.height=viewport.height+'px';
      const render=item.render({canvas:element,viewport,transform:[ratio,0,0,ratio,0,0]});task.current=render;await render.promise;if(!active)return;
      layer=new TextLayer({textContentSource:await item.getTextContent(),container:layerElement,viewport});await layer.render();
      if(active){const thumb=document.createElement('canvas');const factor=Math.min(1,1600/element.width);thumb.width=element.width*factor;thumb.height=element.height*factor;thumb.getContext('2d')!.drawImage(element,0,0,thumb.width,thumb.height);changeSnapshot({documentId,page,image:thumb.toDataURL('image/jpeg',.84),selection:'',ready:true});}
    })().catch(e=>{if(active&&e.name!=='RenderingCancelledException')onError('Impossibile visualizzare la pagina: '+e.message);}).finally(()=>{if(active)setRendering(false);});
    return()=>{active=false;task.current?.cancel();layer?.cancel();};
  },[pdf,page,width,zoom]);
  return <div className="viewer">
    <div className="viewer-bar"><Icon name="file"/><select aria-label="Documento aperto" value={documentId} onChange={e=>onNavigate(e.target.value,1)}>{!documents.length&&<option value="">Nessun materiale</option>}{documents.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select><button className="icon-button" title="Riduci" disabled={zoom<=.6} onClick={()=>setZoom(z=>Math.max(.6,z-.2))}>−</button><button className="zoom" title="Adatta alla larghezza" onClick={()=>setZoom(1)}>{Math.round(zoom*100)}%</button><button className="icon-button" title="Ingrandisci" disabled={zoom>=2} onClick={()=>setZoom(z=>Math.min(2,z+.2))}>+</button></div>
    <div className="pdf-scroll" ref={holder} onMouseUp={()=>{const selection=window.getSelection()?.toString().trim()||'';if(selection)changeSnapshot({...snapshot.current,selection:selection.slice(0,15000)});}}>
      {loading&&<div className="loading"><Spinner/> Apertura documento</div>}
      {!documentId&&<div className="empty"><Icon name="file" size={26}/><h3>Le tue slide, qui.</h3><p>Aggiungi PDF o appunti nella sezione Materiali.</p></div>}
      {doc?.kind==='note'&&<div className="note-page"><RichText text={note}/></div>}
      {doc?.kind==='pdf'&&<div className="pdf-sheet"><canvas ref={canvas}/><div ref={textLayer} className="textLayer"/>{rendering&&<span className="page-loading"><Spinner/></span>}</div>}
    </div>
    <div className="viewer-footer"><span>{doc?.kind==='pdf'?'Seleziona un passaggio per discuterne':'Appunti'}</span>{doc&&<div className="pagination"><button className="icon-button" aria-label="Pagina precedente" disabled={page<=1||loading} onClick={()=>onNavigate(documentId,page-1)}><Icon name="back" size={14}/></button><input aria-label="Numero pagina" value={draftPage} onChange={e=>setDraftPage(e.target.value)} onBlur={()=>{const n=Number(draftPage);if(Number.isInteger(n)&&n>=1&&n<=doc.pages)onNavigate(documentId,n);else setDraftPage(String(page));}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/><span>/ {doc.pages}</span><button className="icon-button" aria-label="Pagina successiva" disabled={page>=doc.pages||loading} onClick={()=>onNavigate(documentId,page+1)}><Icon name="chevron" size={14}/></button></div>}</div>
  </div>;
}
