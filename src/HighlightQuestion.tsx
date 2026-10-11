import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
export interface HighlightDraft {id:string;text:string;question:string;documentId?:string;page?:number;messageIndex?:number;label:string}
export function HighlightQuestion({documentId,documentName,page,language,busy,onAdd}:{documentId:string;documentName:string;page:number;language:'en'|'it';busy:boolean;onAdd:(draft:HighlightDraft)=>void}){
  const [picked,setPicked]=useState<Omit<HighlightDraft,'id'|'question'>&{left:number;top:number}|null>(null),[question,setQuestion]=useState('');
  const panel=useRef<HTMLFormElement>(null);
  useEffect(()=>{
    const capture=(event:Event)=>{
      if(panel.current?.contains(event.target as Node)||busy)return;
      const selection=window.getSelection();if(!selection?.rangeCount||selection.isCollapsed){setPicked(null);return;}
      const range=selection.getRangeAt(0),text=selection.toString().trim();if(!text||text.length>15000){setPicked(null);return;}
      const element=range.startContainer.nodeType===Node.ELEMENT_NODE?range.startContainer as Element:range.startContainer.parentElement;
      const reply=element?.closest<HTMLElement>('[data-reply-index]'),sheet=element?.closest<HTMLElement>('[data-page]'),note=element?.closest<HTMLElement>('.note-page');
      const source=reply||sheet||note;if(!source||!source.closest('.study-layout')||!source.contains(range.endContainer)){setPicked(null);return;}
      const rect=range.getBoundingClientRect();if(!rect.width&&!rect.height)return;
      const top=rect.bottom+10+110<window.innerHeight?rect.bottom+10:Math.max(8,rect.top-110);
      setQuestion('');setPicked({text,left:Math.max(8,Math.min(rect.left,window.innerWidth-350)),top,...reply?{messageIndex:Number(reply.dataset.replyIndex),label:'Tutor'}:{documentId,page:Number(sheet?.dataset.page)||page,label:documentName+' · p. '+(Number(sheet?.dataset.page)||page)}});
    };
    const dismiss=(event:Event)=>{if(!panel.current?.contains(event.target as Node))setPicked(null);};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')setPicked(null);else if(event.key==='Shift')capture(event);};
    document.addEventListener('mouseup',capture);document.addEventListener('keyup',key);document.addEventListener('scroll',dismiss,true);window.addEventListener('resize',dismiss);
    return()=>{document.removeEventListener('mouseup',capture);document.removeEventListener('keyup',key);document.removeEventListener('scroll',dismiss,true);window.removeEventListener('resize',dismiss);};
  },[documentId,documentName,page,language,busy]);
  useEffect(()=>{if(busy)setPicked(null);},[busy]);
  if(!picked)return null;
  return createPortal(<form ref={panel} className="highlight-question" style={{left:picked.left,top:picked.top}} onSubmit={event=>{event.preventDefault();if(!question.trim())return;const {left,top,...source}=picked;onAdd({...source,id:crypto.randomUUID(),question:question.trim()});setPicked(null);window.getSelection()?.removeAllRanges();}}>
    <label htmlFor="highlight-question-input">{language==='en'?'Ask about this passage':'Chiedi su questo passaggio'}</label>
    <div><input id="highlight-question-input" autoFocus maxLength={3000} value={question} onChange={e=>setQuestion(e.target.value)} placeholder={language==='en'?'Type a question…':'Scrivi una domanda…'}/><button disabled={!question.trim()} type="submit" aria-label={language==='en'?'Add question':'Aggiungi domanda'}>↵</button><button type="button" aria-label={language==='en'?'Dismiss question':'Chiudi domanda'} onClick={()=>setPicked(null)}>×</button></div>
    <small>{language==='en'?'Enter adds it to the chat draft':'Invio aggiunge la domanda alla bozza'}</small>
  </form>,document.body);
}
