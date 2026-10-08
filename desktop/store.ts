import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import type { Course, CourseDetail, Topic, TreeDraft, Document, Page, Quiz, PublicQuiz } from './types.js';
import { validateTree } from './tree.js';
export type { Course } from './types.js';
export function publicQuiz(quiz: Quiz): PublicQuiz {
  return {...quiz, questions: quiz.questions.map(q => quiz.status === 'submitted' ? q : {id:q.id,kind:q.kind,prompt:q.prompt,options:q.options,sources:q.sources})};
}
export class CourseStore {
  private db: DatabaseSync;
  constructor(path: string, backupPath?:string) {
    this.db = new DatabaseSync(path);
    if(backupPath&&!existsSync(backupPath))this.db.prepare('VACUUM INTO ?').run(backupPath);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS courses (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, syllabus TEXT NOT NULL, updatedAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS course_state (courseId TEXT PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE, tree TEXT NOT NULL DEFAULT '[]', draft TEXT, revision INTEGER NOT NULL DEFAULT 0, treeRevision INTEGER NOT NULL DEFAULT 0, syllabusUrl TEXT NOT NULL DEFAULT '', fetchedAt TEXT NOT NULL DEFAULT '');
      CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, courseId TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE, name TEXT NOT NULL, kind TEXT NOT NULL, pages INTEGER NOT NULL, hash TEXT NOT NULL, addedAt TEXT NOT NULL, emptyPages INTEGER NOT NULL DEFAULT 0, UNIQUE(courseId,hash));
      CREATE TABLE IF NOT EXISTS pages (documentId TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, number INTEGER NOT NULL, text TEXT NOT NULL, PRIMARY KEY(documentId,number));
      CREATE TABLE IF NOT EXISTS quizzes (id TEXT PRIMARY KEY, courseId TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
      INSERT OR IGNORE INTO course_state(courseId) SELECT id FROM courses;`);
  }
  transaction<T>(action:()=>T):T { this.db.exec('BEGIN IMMEDIATE'); try {const result=action();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;} }
  list(): Course[] { return this.db.prepare('SELECT c.*,s.syllabusUrl,s.fetchedAt FROM courses c JOIN course_state s ON s.courseId=c.id ORDER BY updatedAt DESC').all() as unknown as Course[]; }
  get(id:string):Course { const c=this.db.prepare('SELECT c.*,s.syllabusUrl,s.fetchedAt FROM courses c JOIN course_state s ON s.courseId=c.id WHERE id=?').get(id); if(!c)throw new Error('Materia non trovata.');return c as unknown as Course; }
  save(value: Omit<Course,'updatedAt'>):Course {
    return this.transaction(()=>{
      const previous=value.id ? this.get(value.id):null;
      const result={...value,id:value.id||randomUUID(),updatedAt:new Date().toISOString()};
      this.db.prepare(`INSERT INTO courses(id,title,description,syllabus,updatedAt) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,syllabus=excluded.syllabus,updatedAt=excluded.updatedAt`).run(result.id,result.title,result.description,result.syllabus,result.updatedAt);
      this.db.prepare('INSERT OR IGNORE INTO course_state(courseId) VALUES(?)').run(result.id);
      this.db.prepare('UPDATE course_state SET syllabusUrl=?,fetchedAt=?,revision=revision+? WHERE courseId=?').run(value.syllabusUrl??previous?.syllabusUrl??'',value.fetchedAt??previous?.fetchedAt??'',!previous||previous.syllabus!==value.syllabus?1:0,result.id);
      return this.get(result.id);
    });
  }
  remove(id:string) {this.get(id);this.transaction(()=>{for(const doc of this.documents(id))this.db.prepare('DELETE FROM settings WHERE key LIKE ?').run('summary:'+doc.hash+':%');this.db.prepare('DELETE FROM courses WHERE id=?').run(id);});}
  detail(id:string):CourseDetail {
    const course=this.get(id); const s=this.db.prepare('SELECT * FROM course_state WHERE courseId=?').get(id)!;
    return {course, documents:this.documents(id),tree:JSON.parse(s.tree as string),draft:s.draft?JSON.parse(s.draft as string):null,revision:s.revision as number,treeStale:s.revision!==s.treeRevision};
  }
  documents(courseId:string):Document[] {return this.db.prepare('SELECT * FROM documents WHERE courseId=? ORDER BY addedAt,name').all(courseId) as unknown as Document[];}
  document(id:string):Document {const d=this.db.prepare('SELECT * FROM documents WHERE id=?').get(id);if(!d)throw new Error('Documento non trovato.');return d as unknown as Document;}
  pages(documentId:string):Page[] {this.document(documentId);return this.db.prepare('SELECT * FROM pages WHERE documentId=? ORDER BY number').all(documentId) as unknown as Page[];}
  addDocument(doc:Document,pages:Page[]) {this.transaction(()=>{this.get(doc.courseId);this.db.prepare('INSERT INTO documents VALUES(?,?,?,?,?,?,?,?)').run(doc.id,doc.courseId,doc.name,doc.kind,doc.pages,doc.hash,doc.addedAt,doc.emptyPages);const insert=this.db.prepare('INSERT INTO pages VALUES(?,?,?)');for(const p of pages)insert.run(doc.id,p.number,p.text);this.db.prepare('UPDATE course_state SET revision=revision+1 WHERE courseId=?').run(doc.courseId);});}
  removeDocument(id:string) {const doc=this.document(id);this.transaction(()=>{const d=this.detail(doc.courseId);const clear=(nodes:Topic[])=>nodes.map(n=>({...n,sources:n.sources.filter(s=>s.documentId!==id)}));this.db.prepare('DELETE FROM settings WHERE key LIKE ?').run('summary:'+doc.hash+':%');this.db.prepare('DELETE FROM documents WHERE id=?').run(id);this.db.prepare('UPDATE course_state SET tree=?,draft=NULL,revision=revision+1 WHERE courseId=?').run(JSON.stringify(clear(d.tree)),doc.courseId);});return doc;}
  saveTree(courseId:string,tree:Topic[]) {validateTree(tree,this.documents(courseId));this.get(courseId);this.db.prepare('UPDATE course_state SET tree=?,draft=NULL WHERE courseId=?').run(JSON.stringify(tree),courseId);return this.detail(courseId);}
  setCheck(courseId:string,topicId:string,partId:string,checked:boolean) {const d=this.detail(courseId);const p=d.tree.find(n=>n.id===topicId)?.parts.find(p=>p.id===partId);if(!p)throw new Error('Parte non trovata.');p.checked=checked;this.db.prepare('UPDATE course_state SET tree=? WHERE courseId=?').run(JSON.stringify(d.tree),courseId);return this.detail(courseId);}
  saveDraft(courseId:string,draft:TreeDraft) {if(this.detail(courseId).revision!==draft.revision)throw new Error('I materiali sono cambiati: rigenera la proposta.');validateTree(draft.nodes,this.documents(courseId));this.db.prepare('UPDATE course_state SET draft=? WHERE courseId=?').run(JSON.stringify(draft),courseId);return this.detail(courseId);}
  discardDraft(courseId:string) {this.db.prepare('UPDATE course_state SET draft=NULL WHERE courseId=?').run(courseId);return this.detail(courseId);}
  applyDraft(courseId:string) {return this.transaction(()=>{const d=this.detail(courseId);if(!d.draft||d.draft.revision!==d.revision)throw new Error('Proposta assente o non aggiornata. Rigenerala.');const checked=new Map(d.tree.flatMap(n=>n.parts.map(p=>[p.id,p.checked] as const)));const nodes=d.draft.nodes.map(n=>({...n,parts:n.parts.map(p=>({...p,checked:checked.get(p.id)??false}))}));validateTree(nodes,d.documents);this.db.prepare('UPDATE course_state SET tree=?,draft=NULL,treeRevision=revision WHERE courseId=?').run(JSON.stringify(nodes),courseId);return this.detail(courseId);});}
  putQuiz(quiz:Quiz) {this.get(quiz.courseId);this.db.prepare('INSERT INTO quizzes VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(quiz.id,quiz.courseId,JSON.stringify(quiz));}
  quiz(id:string):Quiz {const q=this.db.prepare('SELECT payload FROM quizzes WHERE id=?').get(id);if(!q)throw new Error('Verifica non trovata.');return JSON.parse(q.payload as string);}
  quizzes(courseId:string) {return this.db.prepare('SELECT payload FROM quizzes WHERE courseId=? ORDER BY rowid DESC').all(courseId).map(q=>{const quiz=JSON.parse(q.payload as string) as Quiz;return {id:quiz.id,title:quiz.title,topicId:quiz.topicId,status:quiz.status,createdAt:quiz.createdAt,graded:quiz.grades.length,total:quiz.questions.length};});}
  setting(key:string,value?:string) {if(value!==undefined)this.db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,value);return this.db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value as string|undefined;}
  close(){this.db.close();}
}
