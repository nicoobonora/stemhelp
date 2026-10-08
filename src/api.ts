import type { AppEvent } from '../desktop/types';
export type { Course, CourseDetail, Topic, Part, SourceRef, Document, PublicQuiz, ChatLine } from '../desktop/types';
export interface AccountStatus {active?:string;signedIn:boolean;accounts:{id:string;label:string}[];warning?:string}
export interface Model {id:string;name:string}
declare global { interface Window {study:{request:(action:string,payload?:unknown)=>Promise<any>;onEvent:(cb:(event:AppEvent)=>void)=>()=>void}} }
export async function api<T=any>(action:string,payload?:unknown):Promise<T>{if(!window.study)throw new Error('Apri stemhelp dall’applicazione desktop.');return window.study.request(action,payload);}
export const uid=()=>crypto.randomUUID();
export const date=(value:string)=>new Intl.DateTimeFormat('it',{day:'numeric',month:'short',year:'numeric'}).format(new Date(value));
