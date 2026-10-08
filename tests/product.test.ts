import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {CourseStore,publicQuiz} from '../desktop/store.js';
import {validateTree,prepareGeneratedTree} from '../desktop/tree.js';
import {gradeChoices,retrieve} from '../desktop/learning.js';
import {importDocument} from '../desktop/documents.js';
import type {Document,Topic,Quiz} from '../desktop/types.js';
function fixture(){const dir=mkdtempSync(join(tmpdir(),'study-product-'));const store=new CourseStore(join(dir,'db.sqlite'));const course=store.save({id:'',title:'Algebra',description:'',syllabus:'Spazi vettoriali, autovalori, diagonalizzazione'});return {dir,store,course,clean:()=>{store.close();rmSync(dir,{recursive:true});}};}
const node:Topic={id:'topic',parentId:null,title:'Autovalori',description:'Significato e calcolo',origin:'program',parts:[{id:'part',label:'Calcolare gli autovalori',checked:true}],sources:[]};
test('albero: impedisce cicli, riferimenti inesistenti e pagine fuori intervallo',()=>{
  assert.throws(()=>validateTree([{...node,parentId:'topic'}],[]));
  assert.throws(()=>validateTree([{...node,parentId:'missing'}],[]));
  assert.throws(()=>validateTree([node,node],[]));
  const doc:Document={id:'doc',courseId:'course',kind:'pdf',name:'Slide',pages:2,hash:'h',addedAt:'now',emptyPages:0};
  assert.throws(()=>validateTree([{...node,sources:[{documentId:'doc',from:1,to:3}]}],[doc]));
  assert.throws(()=>validateTree([{...node,sources:[{documentId:'other',from:1,to:1}]}],[doc]));
});
test('generazione non può attribuire check; parti invariate conservate, nuove o rinominate no',()=>{
  const raw=[{key:'a',parentKey:null,existingId:'topic',title:'Autovalori',description:'D',origin:'program',parts:['Calcolare gli autovalori','Interpretarli'],sources:[],checked:true}];
  const tree=prepareGeneratedTree(raw,[node],[]);assert.equal(tree[0].id,'topic');assert.equal(tree[0].parts[0].checked,true);assert.equal(tree[0].parts[1].checked,false);
  const renamed=prepareGeneratedTree([{...raw[0],title:'Spazi vettoriali'}],[node],[]);assert.notEqual(renamed[0].id,'topic');assert.equal(renamed[0].parts[0].checked,false);
});
test('proposta: modifiche ai check dopo la generazione sono preservate; revisione obsoleta rifiutata',()=>{
  const f=fixture();try{f.store.saveTree(f.course.id,[node]);const revision=f.store.detail(f.course.id).revision;f.store.saveDraft(f.course.id,{nodes:[node],notes:'',revision,createdAt:'now'});f.store.setCheck(f.course.id,'topic','part',false);assert.equal(f.store.applyDraft(f.course.id).tree[0].parts[0].checked,false);
    f.store.saveDraft(f.course.id,{nodes:[node],notes:'',revision,createdAt:'now'});f.store.save({...f.course,syllabus:'Nuovo programma'});assert.throws(()=>f.store.applyDraft(f.course.id));
  }finally{f.clean();}
});
test('soluzioni nascoste prima della consegna; risposte multiple valutate deterministicamente',()=>{
  const q:Quiz={id:'q',courseId:'c',topicId:'t',title:'Test',createdAt:'now',status:'draft',questions:[{id:'one',kind:'mcq',prompt:'Domanda',options:['a','b','c','d'],answer:2,solution:'SEGRETO',rubric:'criterio',sources:[]}],answers:{one:'2'},grades:[],warning:''};
  assert.doesNotMatch(JSON.stringify(publicQuiz(q)),/SEGRETO|rubric|"answer":/);assert.equal(gradeChoices(q)[0].score,2);q.answers.one='';assert.equal(gradeChoices(q)[0].score,0);q.status='submitted';assert.match(JSON.stringify(publicQuiz(q)),/SEGRETO/);
});
test('retrieval isolato per materia e priorità alla pagina aperta',()=>{
  const f=fixture();try{
    const other=f.store.save({id:'',title:'Fisica',description:'',syllabus:'Ottica'});
    f.store.addDocument({id:'d',courseId:f.course.id,name:'Slide.pdf',kind:'pdf',hash:'h',pages:2,addedAt:'now',emptyPages:0},[{documentId:'d',number:1,text:'autovalori matrici'},{documentId:'d',number:2,text:'Pagina attuale'}]);
    f.store.addDocument({id:'o',courseId:other.id,name:'Altro',kind:'note',hash:'h2',pages:1,addedAt:'now',emptyPages:0},[{documentId:'o',number:1,text:'SEGRETO autovalori'}]);
    const refs=retrieve(f.store,f.store.detail(f.course.id),'autovalori',undefined,'d',2);assert.equal(refs[0].page,2);assert.doesNotMatch(JSON.stringify(refs),/SEGRETO/);
  }finally{f.clean();}
});
test('importazione PDF reale in worker, duplicati e rimozione riferimenti',async()=>{
  const f=fixture();try{
    const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica);pdf.addPage().drawText('Autovalori e autovettori',{font});pdf.addPage();const path=join(f.dir,'slides.pdf');writeFileSync(path,await pdf.save());
    const result=await importDocument(f.store,f.dir,f.course.id,path,()=>{});assert.equal(result.document.pages,2);assert.equal(result.document.emptyPages,1);assert.match(f.store.pages(result.document.id)[0].text,/Autovalori/);
    assert.equal((await importDocument(f.store,f.dir,f.course.id,path,()=>{})).duplicate,true);
    f.store.saveTree(f.course.id,[{...node,sources:[{documentId:result.document.id,from:1,to:2}]}]);f.store.removeDocument(result.document.id);assert.equal(f.store.detail(f.course.id).tree[0].sources.length,0);assert.equal(f.store.detail(f.course.id).tree[0].parts[0].checked,true);
  }finally{f.clean();}
});
