import { useSyncExternalStore } from 'react';
import { translateMessage, translate, type AppLanguage } from '../desktop/localization';
export type { AppLanguage } from '../desktop/localization';
let language:AppLanguage='en';
const listeners=new Set<()=>void>();
export const getAppLanguage=()=>language;
export function setAppLanguage(value:AppLanguage){
  language=value;
  document.documentElement.lang=value;
  listeners.forEach(listener=>listener());
}
export function useAppLanguage(){return useSyncExternalStore(listener=>{listeners.add(listener);return()=>{listeners.delete(listener);};},getAppLanguage);}
export const tr=(key:string,values?:Record<string,string|number>)=>translate(key,language,values);

export const message=(text:string)=>translateMessage(text,language);
