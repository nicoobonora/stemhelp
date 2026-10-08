import { useEffect, useRef, useState } from 'react';
import { api, type CourseDetail, type Topic, type SourceRef, type ChatLine } from './api';
import { PdfViewer, type PageSnapshot } from './PdfViewer';
import { Icon, RichText, Spinner } from './components';
import type { Run } from './CourseView';
export function StudyView({detail,topic,initialSource,model,busy,run,onBack,onError}:{detail:CourseDetail;topic:Topic|null;initialSource?:SourceRef;model:string;busy:boolean;run:Run;onBack:()=>void;onError:(m:string)=>void}){
  const [language,setLanguage]=useState<'en'|'it'>('en'),[languageReady,setLanguageReady]=useState(false);
  useEffect(()=>{void api<'en'|'it'>('chat.language.get').then(value=>{setLanguage(value);setLanguageReady(true);}).catch(e=>onError(e.message));},[]);
  const first=initialSource||topic?.sources[0];
  const [documentId,setDocumentId]=useState(first?.documentId||detail.documents[0]?.id||''),[page,setPage]=useState(first?.from||1);
  const [snapshot,setSnapshot]=useState<PageSnapshot>({documentId,page,selection:'',ready:!documentId}),[includeImage,setIncludeImage]=useState(true);
  const [lines,setLines]=useState<ChatLine[]>([]),[question,setQuestion]=useState(''),[stream,setStream]=useState(''),[sending,setSending]=useState(false),[submitted,setSubmitted]=useState(''),[split,setSplit]=useState(58);
  const [quote,setQuote]=useState<{messageIndex:number;text:string}|null>(null),[selectedReply,setSelectedReply]=useState<{messageIndex:number;text:string}|null>(null);
  const composer=useRef<HTMLTextAreaElement>(null),messages=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const capture=()=>{
      const selection=window.getSelection();
      if(!selection||selection.isCollapsed||!selection.rangeCount){setSelectedReply(null);return;}
      const range=selection.getRangeAt(0);
      const reply=Array.from(messages.current?.querySelectorAll<HTMLElement>('[data-reply-index]')||[]).find(el=>el.contains(range.startContainer)&&el.contains(range.endContainer));
      const text=selection.toString().trim();
      setSelectedReply(reply&&text?{messageIndex:Number(reply.dataset.replyIndex),text}:null);
    };
    document.addEventListener('selectionchange',capture);return()=>document.removeEventListener('selectionchange',capture);
  },[]);
  const followOutput=useRef(true),lastScrollTop=useRef(0),columns=useRef<HTMLDivElement>(null);
  const [resizing,setResizing]=useState(false);
  const resizeTo=(x:number)=>{const bounds=columns.current?.getBoundingClientRect();if(bounds)setSplit(Math.max(250/bounds.width*100,Math.min((bounds.width-338)/bounds.width*100,(x-bounds.left)/bounds.width*100)));};const key={courseId:detail.course.id,topicId:topic?.id||''};
  useEffect(()=>{void api<ChatLine[]>('chat.get',key).then(setLines).catch(e=>onError(e.message));return window.study.onEvent(e=>{if(e.type==='delta'&&e.courseId===detail.course.id)setStream(s=>s+(e.delta||''));});},[detail.course.id,topic?.id]);
  useEffect(()=>{const box=messages.current;if(box&&followOutput.current){box.scrollTop=box.scrollHeight;lastScrollTop.current=box.scrollTop;}},[stream,lines,sending]);
  const trackScroll=()=>{const box=messages.current;if(!box)return;if(box.scrollTop<lastScrollTop.current-1)followOutput.current=false;else if(box.scrollHeight-box.clientHeight-box.scrollTop<8)followOutput.current=true;lastScrollTop.current=box.scrollTop;};
  const navigate=(id:string,p:number)=>{const d=detail.documents.find(d=>d.id===id);if(!d||p<1||p>d.pages){onError('Il riferimento non corrisponde a una pagina disponibile.');return;}setDocumentId(id);setPage(p);setSnapshot({documentId:id,page:p,selection:'',ready:false});};
  async function send(){
    const current=question.trim();if(!current||!languageReady||busy)return;
    const display=quote?'> '+quote.text.replace(/\n/g,'\n> ')+'\n\n'+current:current;
    followOutput.current=true;setStream('');setSending(true);setSubmitted(display);
    const answer=await run('Risposta del tutor',()=>api<string>('chat.ask',{...key,model,question:current,quote:quote||undefined,documentId,page,selection:snapshot.selection,image:includeImage?snapshot.image:undefined}));
    if(answer){setLines(old=>[...old,{role:'user',content:display},{role:'assistant',content:answer}]);setQuestion('');setQuote(null);setSelectedReply(null);}
    setStream('');setSubmitted('');setSending(false);
  }
  return <div className="study-layout"><header className="study-header"><button className="icon-button" aria-label="Torna alla materia" disabled={busy} onClick={onBack}><Icon name="back"/></button><div><span>{detail.course.title}</span><h1>{topic?.title||'Studio libero'}</h1></div></header>
    <div ref={columns} className={`study-columns ${resizing?'resizing':''}`} style={{gridTemplateColumns:`minmax(250px, ${split}fr) 8px minmax(330px, ${100-split}fr)`}}>
      <PdfViewer documents={detail.documents} documentId={documentId} page={page} onNavigate={navigate} onSnapshot={setSnapshot} onError={onError}/>
      <div className="study-divider" role="separator" aria-label="Ridimensiona PDF e chat" aria-orientation="vertical" aria-valuenow={Math.round(split)} tabIndex={0} onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);setResizing(true);}} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))resizeTo(e.clientX);}} onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);setResizing(false);}} onPointerCancel={()=>setResizing(false)} onLostPointerCapture={()=>setResizing(false)} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const bounds=columns.current?.getBoundingClientRect();if(bounds)resizeTo(bounds.left+bounds.width*split/100+(e.key==='ArrowLeft'?-20:20));}}}/>
      <section className="chat"><header className="chat-header"><span>Tutor</span><div className="chat-header-actions"><div className="chat-language" role="group" aria-label="Chatbot language">{(['en','it'] as const).map(value=><button key={value} type="button" aria-label={value==='en'?'English':'Italiano'} aria-pressed={language===value} disabled={busy||!languageReady} title={value==='en'?'Reply in English':'Rispondi in italiano'} onClick={()=>void run('',async()=>{setLanguage(await api<'en'|'it'>('chat.language.set',value));})}>{value.toUpperCase()}</button>)}</div><button disabled={busy||!lines.length} onClick={()=>void run('',async()=>{await api('chat.reset',key);followOutput.current=true;setLines([]);setStream('');setQuote(null);setSelectedReply(null);window.getSelection()?.removeAllRanges();})}><Icon name="plus" size={14}/> Nuova chat</button></div></header>
        <div className="chat-context"><span className="context-dot"/>{documentId?`${detail.documents.find(d=>d.id===documentId)?.name} · p. ${page}`:'Contesto del corso'}<span className="context-label">collegato</span></div>
        <div className="messages" ref={messages} onScroll={trackScroll} onWheel={e=>{if(e.deltaY<0)followOutput.current=false;}} onKeyDown={e=>{if(['ArrowUp','PageUp','Home'].includes(e.key))followOutput.current=false;}} tabIndex={0} aria-label="Messaggi del tutor" aria-live="polite">{!lines.length&&!sending&&<div className="chat-welcome"><h2>Da dove ripartiamo?</h2><p>Chiedi un’intuizione, il perché di un passaggio o un esempio. Il tutor conosce il programma e il punto in cui stai studiando.</p><div className="suggestions">{['Spiegami l’idea dietro questa pagina.','Quali ipotesi sono necessarie qui?','Fammi un esempio concreto.'].map(s=><button key={s} disabled={busy} onClick={()=>setQuestion(s)}>{s}<Icon name="arrow" size={14}/></button>)}</div></div>}{lines.map((line,i)=><article key={i} className={`message ${line.role}`}><span className="message-author">{line.role==='user'?'Tu':'Tutor'}</span><div data-reply-index={line.role==='assistant'?i:undefined}><RichText text={line.content} onSource={navigate}/></div>{line.role==='assistant'&&selectedReply?.messageIndex===i&&!sending&&<button className="quote-reply" type="button" disabled={busy} onMouseDown={e=>e.preventDefault()} onClick={()=>{if(selectedReply.text.length>15000){onError(language==='en'?'Select a shorter passage (up to 15,000 characters).':'Seleziona un passaggio più breve (massimo 15.000 caratteri).');return;}setQuote(selectedReply);window.getSelection()?.removeAllRanges();composer.current?.focus();}}>{language==='en'?'Quote in next question':'Cita nella prossima domanda'}</button>}</article>)}{sending&&<><article className="message user"><span className="message-author">Tu</span><RichText text={submitted} onSource={navigate}/></article><article className="message assistant"><span className="message-author">Tutor</span>{stream?<RichText text={stream} onSource={navigate}/>:<Spinner/>}</article></>}</div>
        <form className="composer" onSubmit={e=>{e.preventDefault();void send();}}>
          {quote&&<div className="reply-quote"><div><span>{language==='en'?'Quoted from Tutor':'Citazione del tutor'}</span><blockquote>{quote.text}</blockquote></div><button type="button" className="icon-button" disabled={sending} aria-label={language==='en'?'Remove quote':'Rimuovi citazione'} onClick={()=>setQuote(null)}><Icon name="close" size={12}/></button></div>}
          {snapshot.selection&&<div className="selection-context"><span>«{snapshot.selection.slice(0,110)}{snapshot.selection.length>110?'…':''}»</span><button type="button" className="icon-button" aria-label="Rimuovi selezione" onClick={()=>setSnapshot({...snapshot,selection:''})}><Icon name="close" size={12}/></button></div>}
          <textarea ref={composer} aria-label="Domanda al tutor" placeholder="Scrivi una domanda…" rows={3} value={question} disabled={sending} maxLength={20000} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();if(!busy&&model&&question.trim()&&(!documentId||snapshot.ready))void send();}}}/>
          <div className="composer-controls"><label className="inline-check"><input type="checkbox" checked={includeImage} onChange={e=>setIncludeImage(e.target.checked)} disabled={sending}/>Includi immagine pagina</label>{sending?<button type="button" onClick={()=>void api('operation.cancel')}>Interrompi</button>:<button className="primary send" aria-label="Invia domanda" disabled={busy||!languageReady||!model||!question.trim()||!!documentId&&!snapshot.ready}><Icon name="send" size={17}/></button>}</div>
          <p className="hint">Nuova chat azzera i messaggi, non il corso. {model?'Invio per inviare · Shift + Invio per andare a capo.':'Collega ChatGPT e scegli un modello nelle impostazioni.'}</p>
        </form>
      </section>
    </div>
  </div>;
}
