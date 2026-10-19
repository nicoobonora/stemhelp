import { tr, message } from './i18n';
import { useEffect, useRef, useState } from 'react';
import { api, date, type PublicQuiz } from './api';
import { Icon, RichText } from './components';
import type { Run } from './CourseView';
export function QuizView({initial,model,busy,run,onBack,onSource}:{initial:PublicQuiz;model:string;busy:boolean;run:Run;onBack:()=>void;onSource:(id:string,page:number)=>void}){
  const [quiz,setQuiz]=useState(initial),[answers,setAnswers]=useState<Record<string,string>>(()=>{try{return initial.status==='draft'?{...initial.answers,...JSON.parse(localStorage.getItem('quiz:'+initial.id)||'{}')}:initial.answers;}catch{return initial.answers;}}),[saved,setSaved]=useState(true),[saveError,setSaveError]=useState('');
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);const submitted=quiz.status==='submitted';
  useEffect(()=>{
    if(submitted)return;
    localStorage.setItem('quiz:'+quiz.id,JSON.stringify(answers));setSaved(false);setSaveError('');
    timer.current=setTimeout(()=>{void api('quiz.save',{id:quiz.id,answers}).then(()=>setSaved(true)).catch(e=>setSaveError(e.message));},500);
    return()=>{if(timer.current)clearTimeout(timer.current);};
  },[answers,submitted]);
  const answered=quiz.questions.filter(q=>answers[q.id]?.trim()).length;
  const score=quiz.grades.reduce((s,g)=>s+g.score,0),max=quiz.questions.length*2;
  async function submit(){
    if(answered<quiz.questions.length&&!confirm(tr("Hai risposto a {0} domande su {1}. Vuoi consegnare comunque?",{0:answered,1:quiz.questions.length})))return;
    if(timer.current)clearTimeout(timer.current);
    const result=await run(tr("Consegna e correzione"),()=>api<PublicQuiz>('quiz.submit',{id:quiz.id,answers,model}));
    if(result){setQuiz(result);setSaved(true);localStorage.removeItem('quiz:'+quiz.id);}
  }
  const leave=()=>void run('',async()=>{if(!submitted)await api('quiz.save',{id:quiz.id,answers});onBack();});
  return <div className="quiz-page"><button className="back-link" disabled={busy} onClick={leave}><Icon name="back" size={14}/> {tr("Torna alla materia")}</button><header className="page-header"><div><p className="eyebrow">{submitted?tr("VERIFICA CONSEGNATA"):tr("METTITI ALLA PROVA")}</p><h1>{quiz.title}</h1><p className="description">{quiz.questions.length} {tr("domande ed esercizi ·")} {date(quiz.createdAt)}</p></div>{submitted?<div className="score"><strong>{score}<span> / {max}</span></strong><small>{quiz.grades.length===quiz.questions.length?tr("Punti della prova"):tr("Punteggio parziale")}</small></div>:<span className="badge">{answered} / {quiz.questions.length} {tr("risposte")}</span>}</header>
    {quiz.warning&&<div className="inline-notice">{message(quiz.warning)}</div>}
    <p className="hint">{submitted?tr("La valutazione degli esercizi è prodotta dall’AI: confrontala con i passaggi e le soluzioni. I tuoi check rimangono invariati."):tr("Rispondi prima di consultare le spiegazioni. Puoi uscire e riprendere la prova in un altro momento.")}</p>
    <div className="questions">{quiz.questions.map((q,index)=>{const grade=quiz.grades.find(g=>g.questionId===q.id);return <section className="question" key={q.id}><div className="question-label"><span>{String(index+1).padStart(2,'0')}</span><span>{q.kind==='mcq'?tr("Scelta multipla"):tr("Esercizio")}</span>{submitted&&<span className="question-score">{grade?`${grade.score} / 2`:tr("Da correggere")}</span>}</div><RichText text={q.prompt} onSource={onSource}/>{q.kind==='mcq'?<fieldset className="options" disabled={submitted||busy}><legend className="sr-only">{tr("Risposta alla domanda")} {index+1}</legend>{q.options.map((option,i)=><label className={`${answers[q.id]===String(i)?'chosen':''} ${submitted&&q.answer===i?'correct':''}`} key={i}><input type="radio" name={q.id} value={i} checked={answers[q.id]===String(i)} onChange={()=>setAnswers({...answers,[q.id]:String(i)})}/><span className="option-letter">{String.fromCharCode(65+i)}</span><RichText text={option}/>{submitted&&q.answer===i&&<Icon name="check" size={16}/>}</label>)}</fieldset>:<label className="exercise-answer"><span>{tr("Il tuo svolgimento")}</span><textarea aria-label={tr("Svolgimento esercizio {0}",{0:index+1})} rows={7} value={answers[q.id]||''} readOnly={submitted} disabled={busy} maxLength={30000} placeholder={tr("Scrivi il procedimento, le ipotesi e il risultato. Puoi usare formule LaTeX.")} onChange={e=>setAnswers({...answers,[q.id]:e.target.value})}/></label>}{submitted&&grade&&<div className="feedback"><span>{tr("Riscontro")}</span><RichText text={message(grade.feedback)} onSource={onSource}/></div>}</section>;})}</div>
    {!submitted?<footer className="quiz-actions"><span className={saveError?'danger':'muted'}>{saveError|| (saved?tr("Risposte salvate"):tr("Salvataggio delle risposte…"))}</span><button className="primary" disabled={busy} onClick={()=>void submit()}>{tr("Consegna e mostra spiegazioni")} <Icon name="arrow" size={16}/></button></footer>:<section className="solutions"><div className="section-heading"><div><p className="eyebrow">{tr("DOPO IL TENTATIVO")}</p><h2>{tr("Spiegazioni e soluzioni")}</h2></div></div>{quiz.gradingError&&<div className="inline-notice"><span>{message(quiz.gradingError)}</span><button disabled={busy||!model} onClick={()=>void run(tr("Correzione degli esercizi"),async()=>setQuiz(await api('quiz.grade',{id:quiz.id,model})))}>{tr("Riprova correzione")}</button></div>}{quiz.questions.map((q,i)=><details key={q.id} open><summary>{String(i+1).padStart(2,'0')} · {q.kind==='mcq'?tr("Spiegazione della risposta"):tr("Svolgimento dell’esercizio")}</summary><RichText text={q.solution||''} onSource={onSource}/>{q.rubric&&<div className="rubric"><strong>{tr("Criteri di valutazione")}</strong><RichText text={q.rubric}/></div>}</details>)}</section>}
  </div>;
}
