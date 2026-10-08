import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('study', {
  request:async(action:string,payload?:unknown)=>{
    const result=await ipcRenderer.invoke('study:request',action,payload);
    if(!result.ok)throw new Error(result.error);return result.value;
  },
  onEvent:(callback:(event:unknown)=>void)=>{
    const listener=(_event:unknown,value:unknown)=>callback(value);
    ipcRenderer.on('study:event',listener);return()=>ipcRenderer.removeListener('study:event',listener);
  }
});
