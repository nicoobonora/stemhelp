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
    if(answered<quiz.questions.length&&!confirm(`Hai risposto a ${answered} domande su ${quiz.questions.length}. Vuoi consegnare comunque?`))return;
    if(timer.current)clearTimeout(timer.current);
    const result=await run('Consegna e correzione',()=>api<PublicQuiz>('quiz.submit',{id:quiz.id,answers,model}));
    if(result){setQuiz(result);setSaved(true);localStorage.removeItem('quiz:'+quiz.id);}
  }
  const leave=()=>void run('',async()=>{if(!submitted)await api('quiz.save',{id:quiz.id,answers});onBack();});
  return <div className="quiz-page"><button className="back-link" disabled={busy} onClick={leave}><Icon name="back" size={14}/> Torna alla materia</button><header className="page-header"><div><p className="eyebrow">{submitted?'VERIFICA CONSEGNATA':'METTITI ALLA PROVA'}</p><h1>{quiz.title}</h1><p className="description">{quiz.questions.length} domande ed esercizi · {date(quiz.createdAt)}</p></div>{submitted?<div className="score"><strong>{score}<span> / {max}</span></strong><small>{quiz.grades.length===quiz.questions.length?'Punti della prova':'Punteggio parziale'}</small></div>:<span className="badge">{answered} / {quiz.questions.length} risposte</span>}</header>
    {quiz.warning&&<div className="inline-notice">{quiz.warning}</div>}
    <p className="hint">{submitted?'La valutazione degli esercizi è prodotta dall’AI: confrontala con i passaggi e le soluzioni. I tuoi check rimangono invariati.':'Rispondi prima di consultare le spiegazioni. Puoi uscire e riprendere la prova in un altro momento.'}</p>
    <div className="questions">{quiz.questions.map((q,index)=>{const grade=quiz.grades.find(g=>g.questionId===q.id);return <section className="question" key={q.id}><div className="question-label"><span>{String(index+1).padStart(2,'0')}</span><span>{q.kind==='mcq'?'Scelta multipla':'Esercizio'}</span>{submitted&&<span className="question-score">{grade?`${grade.score} / 2`:'Da correggere'}</span>}</div><RichText text={q.prompt} onSource={onSource}/>{q.kind==='mcq'?<fieldset className="options" disabled={submitted||busy}><legend className="sr-only">Risposta alla domanda {index+1}</legend>{q.options.map((option,i)=><label className={`${answers[q.id]===String(i)?'chosen':''} ${submitted&&q.answer===i?'correct':''}`} key={i}><input type="radio" name={q.id} value={i} checked={answers[q.id]===String(i)} onChange={()=>setAnswers({...answers,[q.id]:String(i)})}/><span className="option-letter">{String.fromCharCode(65+i)}</span><RichText text={option}/>{submitted&&q.answer===i&&<Icon name="check" size={16}/>}</label>)}</fieldset>:<label className="exercise-answer"><span>Il tuo svolgimento</span><textarea aria-label={`Svolgimento esercizio ${index+1}`} rows={7} value={answers[q.id]||''} readOnly={submitted} disabled={busy} maxLength={30000} placeholder="Scrivi il procedimento, le ipotesi e il risultato. Puoi usare formule LaTeX." onChange={e=>setAnswers({...answers,[q.id]:e.target.value})}/></label>}{submitted&&grade&&<div className="feedback"><span>Riscontro</span><RichText text={grade.feedback} onSource={onSource}/></div>}</section>;})}</div>
    {!submitted?<footer className="quiz-actions"><span className={saveError?'danger':'muted'}>{saveError|| (saved?'Risposte salvate':'Salvataggio delle risposte…')}</span><button className="primary" disabled={busy} onClick={()=>void submit()}>Consegna e mostra spiegazioni <Icon name="arrow" size={16}/></button></footer>:<section className="solutions"><div className="section-heading"><div><p className="eyebrow">DOPO IL TENTATIVO</p><h2>Spiegazioni e soluzioni</h2></div></div>{quiz.gradingError&&<div className="inline-notice"><span>{quiz.gradingError}</span><button disabled={busy||!model} onClick={()=>void run('Correzione degli esercizi',async()=>setQuiz(await api('quiz.grade',{id:quiz.id,model})))}>Riprova correzione</button></div>}{quiz.questions.map((q,i)=><details key={q.id} open><summary>{String(i+1).padStart(2,'0')} · {q.kind==='mcq'?'Spiegazione della risposta':'Svolgimento dell’esercizio'}</summary><RichText text={q.solution||''} onSource={onSource}/>{q.rubric&&<div className="rubric"><strong>Criteri di valutazione</strong><RichText text={q.rubric}/></div>}</details>)}</section>}
  </div>;
}
