import { app, BrowserWindow, ipcMain, shell, dialog, Menu } from 'electron';
import { mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ZodError } from 'zod';
import { CourseStore } from './store.js';
import { Auth } from './auth.js';
import { translateMessage } from './localization.js';
import { StudyService } from './service.js';
// Keep the existing storage/keychain identity so rebranding preserves local data.
app.setName('study-quadernone');
const root=fileURLToPath(new URL('../',import.meta.url));
const adjacent=process.platform==='darwin'?resolve(dirname(app.getPath('exe')),'../../..'):dirname(app.getPath('exe'));
if(process.env.STUDY_DATA_DIR)app.setPath('userData',resolve(process.env.STUDY_DATA_DIR));
else if(app.isPackaged&&existsSync(join(adjacent,'.study-project')))app.setPath('userData',join(adjacent,'.local-data'));
if(!app.requestSingleInstanceLock()){app.quit();}else{
let window:BrowserWindow|undefined,store:CourseStore,auth:Auth,service:StudyService;
const tr=(text:string)=>translateMessage(text,store?.setting('appLanguage')==='it'?'it':'en');
app.whenReady().then(async()=>{
  const iconPath=join(root,'assets/icon.png');
  if(process.platform==='darwin')app.dock?.setIcon(iconPath);
  app.setAboutPanelOptions({applicationName:'stemhelp',iconPath});
  const directory=app.getPath('userData');mkdirSync(directory,{recursive:true,mode:0o700});
  const dbPath=join(directory,'study.sqlite');
  // Preserve a snapshot before the first schema expansion, without touching credentials.
  store=new CourseStore(dbPath,existsSync(dbPath)?join(directory,'study-before-v1.sqlite'):undefined);auth=new Auth(directory,()=>store.setting('appLanguage')==='it'?'it':'en');
  service=new StudyService(store,auth,directory,event=>{if(window&&!window.isDestroyed())window.webContents.send('study:event',event);});
  ipcMain.handle('study:request',async(event,action,payload)=>{
    if(event.sender!==window?.webContents||event.senderFrame!==event.sender.mainFrame)return {ok:false,error:'Richiesta non autorizzata.'};
    try{
      let value;
      if(action==='chat.attach'){
        service.idle();await service.request('chat.attachments',payload);const result=await dialog.showOpenDialog(window!,{title:tr('Allega alla chat'),properties:['openFile','multiSelections'],filters:[{name:tr('Contesto temporaneo'),extensions:['pdf','txt','md','csv','png','jpg','jpeg','webp']}]});value=result.canceled?null:await service.attachFiles(payload,result.filePaths);
      }else if(action==='documents.import'){
        service.idle();store.get(payload);const result=await dialog.showOpenDialog(window!,{title:tr('Aggiungi materiali'),properties:['openFile','multiSelections'],filters:[{name:tr('Materiali didattici'),extensions:['pdf','txt','md']}]});
        value=result.canceled?null:await service.importFiles(payload,result.filePaths);
      }else if(action==='course.export'){
        service.idle();const course=store.get(payload);const result=await dialog.showSaveDialog(window!,{title:tr('Esporta materia'),defaultPath:course.title.replace(/[^\p{L}\p{N} -]/gu,'')+'.study',filters:[{name:tr('Materia stemhelp'),extensions:['study']}]});value=!result.canceled&&result.filePath?await service.exportCourse(payload,result.filePath):false;
      }else if(action==='course.import'){
        service.idle();const result=await dialog.showOpenDialog(window!,{title:tr('Importa materia'),properties:['openFile'],filters:[{name:tr('Materia stemhelp'),extensions:['study']}]});value=result.canceled?null:await service.importCourse(result.filePaths[0]);
      }else if(action==='usage.open'){value=await shell.openExternal('https://chatgpt.com/settings/usage');}
      else if(action==='link.open'){
        const url=new URL(payload);if(!['https:','http:'].includes(url.protocol))throw new Error('Collegamento non valido.');value=await shell.openExternal(url.toString());
      }else value=await service.request(action,payload);
      if(action==='app.language.set')updateMenu();
      return {ok:true,value};
    }catch(error){return {ok:false,error:tr(error instanceof ZodError?'Dati non validi. Controlla i campi o riprova la generazione.':error instanceof Error?error.message:'Operazione non riuscita.')};}
  });
  function updateMenu(){Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'stemhelp',submenu:[{role:'about',label:tr('Informazioni su stemhelp')},{type:'separator'},{role:'hide',label:tr('Nascondi stemhelp')},{role:'hideOthers',label:tr('Nascondi altre')},{role:'unhide',label:tr('Mostra tutte')},{type:'separator'},{role:'quit',label:tr('Esci da stemhelp')}]},
    {label:tr('Modifica'),submenu:[{role:'undo',label:tr('Annulla modifica')},{role:'redo',label:tr('Ripristina')},{type:'separator'},{role:'cut',label:tr('Taglia')},{role:'copy',label:tr('Copia')},{role:'paste',label:tr('Incolla')},{role:'selectAll',label:tr('Seleziona tutto')}]},
    {label:tr('Vista'),submenu:[{role:'resetZoom',label:tr('Dimensioni reali')},{role:'zoomIn',label:tr('Ingrandisci')},{role:'zoomOut',label:tr('Riduci')},{type:'separator'},{role:'togglefullscreen',label:tr('Schermo intero')}]},
    {label:tr('Finestra'),submenu:[{role:'minimize',label:tr('Riduci a icona')},{role:'close',label:tr('Chiudi')}]}
  ]));}
  updateMenu();
  window=new BrowserWindow({icon:iconPath,width:1440,height:940,minWidth:1000,minHeight:680,title:'stemhelp',backgroundColor:'#fafafa',webPreferences:{preload:join(root,'dist-desktop/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());
  window.on('close',event=>{if(service.busy()){const choice=dialog.showMessageBoxSync(window!,{type:'question',buttons:[tr('Continua a lavorare'),tr('Interrompi e chiudi')],defaultId:0,cancelId:0,message:tr('È in corso un’operazione AI. Vuoi interromperla?'),detail:tr('Le risposte già salvate rimarranno disponibili.')});if(choice===0){event.preventDefault();return;}}service.cancel();auth.cancelLogin();});
  window.on('closed',()=>{window=undefined;app.quit();});
  await window.loadURL(pathToFileURL(join(root,'dist/index.html')).toString());
}).catch(error=>{dialog.showErrorBox(tr('stemhelp — avvio non riuscito'),error.message);app.exit(1);});
app.on('second-instance',()=>{window?.show();window?.focus();});
app.on('before-quit',()=>{service?.cancel();auth?.cancelLogin();});
app.on('will-quit',()=>store?.close());
}
