import {_electron as electron} from '@playwright/test';
import {resolve,join} from 'node:path';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {PDFDocument,StandardFonts} from 'pdf-lib';
const env={...process.env,STUDY_DATA_DIR:resolve('.local-data')};delete env.ELECTRON_RUN_AS_NODE;
const temporary=mkdtempSync(join(tmpdir(),'study-live-'));let desktop,courseId;
try{
  desktop=await electron.launch({args:[resolve('.')],env,timeout:30000});const page=await desktop.firstWindow();await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(()=>!!window.study);
  const request=(action,payload)=>page.evaluate(({action,payload})=>window.study.request(action,payload),{action,payload});
  const state=await request('app.state');if(!state.auth.signedIn)throw new Error('Account non collegato: nessun test AI eseguito.');
  const models=await request('auth.models');const model=models.find(m=>m.id===state.model)?.id||models[0]?.id;if(!model)throw new Error('Nessun modello disponibile.');
  console.log('Account collegato; catalogo modelli disponibile.');
  const course=await request('course.save',{id:'',title:'Verifica tecnica temporanea',description:'Dati sintetici per la verifica dell’app; verranno rimossi alla fine.',syllabus:'Algebra lineare: definire autovalori e autovettori, calcolarli per matrici diagonali 2x2. Comprendere la diagonalizzazione come cambio di base. Non sono richiesti teoremi spettrali avanzati.'});courseId=course.id;
  const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica);const sheet=pdf.addPage([720,480]);sheet.drawText('Autovalori e autovettori',{x:45,y:420,size:24,font});sheet.drawText('A v = lambda v, v non nullo.',{x:45,y:330,size:20,font});sheet.drawText('Esempio: A = diag(2,3). Autovalori: 2 e 3.',{x:45,y:240,size:16,font});const path=join(temporary,'Algebra.pdf');writeFileSync(path,await pdf.save());
  await desktop.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},path);
  await request('documents.import',courseId);console.log('PDF importato. Generazione reale dell’albero…');
  const generated=await request('tree.generate',{courseId,model});if(!generated.draft?.nodes.length)throw new Error('Nessuna proposta generata.');await request('tree.apply',courseId);const detail=await request('course.get',courseId);const topic=detail.tree[0];console.log(`Albero reale valido: ${detail.tree.length} argomenti.`);
  // Load the real PDF viewer to include the rendered page in the request.
  await page.reload();await page.locator('.course-nav button').filter({hasText:'Verifica tecnica temporanea'}).click();await page.getByRole('button',{name:'Materiali',exact:true}).click();await page.getByRole('button',{name:'Apri',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.textLayer')?.textContent?.includes('Autovalori'));
  const image=await page.locator('canvas').evaluate(c=>c.toDataURL('image/jpeg',.8));
  const answer=await request('chat.ask',{courseId,topicId:topic.id,model,question:'Spiega in non più di 80 parole la relazione nella pagina, includendo le ipotesi. Cita la pagina fornita.',documentId:detail.documents[0].id,page:1,selection:'',image});if(!answer.trim())throw new Error('Risposta vuota.');console.log('Chat reale con immagine del PDF completata.');
  await request('chat.reset',{courseId,topicId:topic.id});if((await request('chat.get',{courseId,topicId:topic.id})).length)throw new Error('Reset non riuscito.');
  console.log('Generazione reale di una verifica di tre domande…');const quiz=await request('quiz.create',{courseId,topicId:topic.id,model,count:3});if(quiz.questions.some(q=>q.solution!==undefined))throw new Error('Soluzioni esposte prima della consegna.');
  const answers=Object.fromEntries(quiz.questions.map(q=>[q.id,q.kind==='mcq'?'0':'Per una matrice diagonale, gli autovalori sono gli elementi sulla diagonale. Per diag(2,3) sono 2 e 3. Il polinomio caratteristico è (2-lambda)(3-lambda).']));
  const graded=await request('quiz.submit',{id:quiz.id,model,answers});if(graded.gradingError)throw new Error('Correzione AI: '+graded.gradingError);if(graded.grades.length!==3)throw new Error('Correzione incompleta.');console.log('Verifica reale generata, consegnata e corretta.');
  console.log('STUDY_LIVE_CHECK_OK');
}finally{
  if(desktop){try{const page=await desktop.firstWindow();if(courseId)await page.evaluate(id=>window.study.request('course.delete',id),courseId);}finally{await desktop.close();}}
  rmSync(temporary,{recursive:true,force:true});
}
