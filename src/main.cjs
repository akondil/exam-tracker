const {app,BrowserWindow,ipcMain,dialog}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const {randomUUID}=require('node:crypto');
const {Store}=require('./database.cjs');
const {studentPatch,examPatch,revalidateParsed,validateAverages,assertDate}=require('./validation.cjs');
let store,win;const pending=new Map();
const page=path.join(__dirname,'../renderer/index.html');
function handler(name,fn){ipcMain.handle(name,async(event,...args)=>{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw new Error('Yetkisiz istek.');try{return {ok:true,data:await fn(...args)};}catch(error){return {ok:false,error:error.message};}});}
const publicFile=f=>({id:f.id,date:f.date,source:f.source,...f.parsed});
// Keep the public distribution separate from an existing local installation.
if(!app.commandLine.hasSwitch('user-data-dir'))app.setPath('userData',path.join(app.getPath('appData'),'sinav-atlasi-public'));
app.whenReady().then(()=>{
 store=new Store(path.join(app.getPath('userData'),'sinav-atlasi.sqlite'));
 handler('snapshot',()=>store.snapshot());
 const reports=require('./report-service.cjs').createReportService(store,()=>win);
 handler('reportContext',id=>reports.context(id));
 handler('reportPreview',(id,options)=>reports.preview(id,options));
 handler('reportPdf',(id,options)=>reports.pdf(id,options));
 handler('reportPrint',(id,options)=>reports.print(id,options));
 handler('reportBatchContext',ids=>reports.batchContext(ids));
 handler('reportBatchPdf',(ids,options)=>reports.batchPdf(ids,options));
 handler('reportBatchPrint',(ids,options)=>reports.batchPrint(ids,options));
 handler('reportLogo',id=>reports.logo(id));
 handler('reportRemoveLogo',id=>reports.removeLogo(id));
 handler('preview',async date=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new Error('Önce geçerli sınav tarihi seçin.');
  const picked=await dialog.showOpenDialog(win,{title:'Sınav sonuç PDF’lerini seçin',properties:['openFile','multiSelections'],filters:[{name:'PDF',extensions:['pdf']}]});if(picked.canceled)return null;
  if(picked.filePaths.length>20)throw new Error('Bir seferde en fazla 20 PDF seçebilirsiniz.');
  const {readPdf,analyzeDocument}=await import('./pdf.mjs');const files=[];pending.clear();
  for(const file of picked.filePaths){const id=randomUUID(),source=path.basename(file);try{if((await fs.stat(file)).size>30*1024*1024)throw new Error('PDF en fazla 30 MB olabilir.');const document=await readPdf(file);const parsed=analyzeDocument(document);const duplicate=store.db.prepare('SELECT id FROM exams WHERE hash=?').get(parsed.hash);if(duplicate)parsed.issues.push({page:1,number:'',message:'Bu PDF daha önce aktarıldı.'});const item={id,date,source,document,parsed,duplicate:!!duplicate};pending.set(id,item);files.push(publicFile(item));}catch(error){files.push({id,date,source,students:[],issues:[{page:1,number:'',message:error.message}],warnings:[],fatal:true,metadata:{},analysis:{detected:0,verified:0,pages:0}});}}
  return {files};
 });
 handler('import',id=>{const item=pending.get(id);if(!item)throw new Error('Önce PDF önizlemesini açın.');const examId=store.import(item.parsed,item.date,item.source);pending.delete(id);return examId;});
 handler('updatePending',(id,index,input)=>{const item=pending.get(id);if(!item||item.duplicate)throw new Error('Düzenlenebilir önizleme bulunamadı.');if(!Number.isInteger(index)||!item.parsed.students[index])throw new Error('Öğrenci satırı bulunamadı.');const before=item.parsed.students[index],after=studentPatch(before,input);item.parsed.students[index]=after;(item.parsed.edits??=[]).push({index,before,after,at:new Date().toISOString()});revalidateParsed(item.parsed);return publicFile(item);});
 handler('updatePendingExam',(id,input)=>{const item=pending.get(id);if(!item||item.duplicate)throw new Error('Düzenlenebilir önizleme bulunamadı.');const previous={metadata:structuredClone(item.parsed.metadata),date:item.date,sourceAverages:structuredClone(item.parsed.sourceAverages)},before=previous.metadata,m=examPatch(before,input);const averages=input.sourceAverages??item.parsed.sourceAverages;validateAverages(averages,item.parsed.students[0]?.lessons.map(l=>l.name)??[]);const date=input.date??item.date;assertDate(date);item.date=date;item.parsed.metadata=m;item.parsed.sourceAverages=averages;(item.parsed.edits??=[]).push({metadata:true,before:previous,after:{metadata:m,date,sourceAverages:averages},at:new Date().toISOString()});revalidateParsed(item.parsed);return publicFile(item);});
 handler('updateResult',(id,input,options)=>store.updateResult(id,input,options));
 handler('updateExam',(id,input)=>store.updateExam(id,input));
 handler('discard',id=>pending.delete(id));
 handler('importBatch',()=>{const succeeded=[],failed=[];for(const item of pending.values()){try{const id=store.import(item.parsed,item.date,item.source);succeeded.push({fileId:item.id,source:item.source,id});pending.delete(item.id);}catch(error){failed.push({fileId:item.id,source:item.source,error:error.message});}}return {succeeded,failed};});
 handler('exportExam',async id=>{const exam=store.snapshot().exams.find(e=>e.id===id);if(!exam)throw new Error('Sınav bulunamadı.');const picked=await dialog.showSaveDialog(win,{defaultPath:`sinav-ozeti-${exam.date}.csv`,filters:[{name:'CSV',extensions:['csv']}]});if(picked.canceled)return false;const cell=v=>'"'+(typeof v==='number'?String(v):String(v??'').replace(/^[=+@-]/,"'$&")).replace(/"/g,'""')+'"';const data=[['Sınav',exam.title],['Tarih',exam.date],['İl',exam.city],['İlçe',exam.district],['Kurum',exam.institution],...['Genel','İl','İlçe','Kurum'].map((s,i)=>['Katılım '+s,exam.metadata.participation?.[i]??null]),[],['Kapsam','Ders','Doğru','Yanlış','Net','LGS Puanı']];for(const [scope,label]of [['general','Genel ortalama'],['school','Okul ortalaması']]){const a=exam.metadata.sourceAverages?.[scope];if(!a)continue;data.push(...a.lessons.map(l=>[label,l.name,l.correct,l.wrong,l.net,null]),[label,'TOPLAM',a.correct,a.wrong,a.net,a.score]);}await fs.writeFile(picked.filePath,'\uFEFF'+data.map(r=>r.map(cell).join(';')).join('\r\n'));return true;});
 handler('threshold',v=>store.setThreshold(v));
 handler('delete',async id=>{const a=await dialog.showMessageBox(win,{type:'warning',buttons:['Vazgeç','Sınavı sil'],defaultId:0,cancelId:0,message:'Bu sınav ve ona ait sonuçlar silinsin mi?',detail:'Bu işlem geri alınamaz.'});if(a.response!==1)return false;store.deleteExam(id);return true;});
 handler('export',async ids=>{
  if(!Array.isArray(ids)||ids.some(id=>!Number.isInteger(id)))throw new Error('Geçersiz kayıt seçimi.');const selected=new Set(ids),rows=store.snapshot().rows.filter(r=>selected.has(r.id));if(!rows.length)throw new Error('Dışa aktarılacak kayıt yok.');
  const picked=await dialog.showSaveDialog(win,{defaultPath:'sinav-sonuclari.csv',filters:[{name:'CSV',extensions:['csv']}]});if(picked.canceled)return false;
  const names=[...new Set(rows.flatMap(r=>r.lessons.map(l=>l.name)))];
  const quote=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';
  const header=['Tarih','Sınav','Kurum','Numara','Öğrenci','Sınıf','Doğru','Yanlış','Net','Puan',...names.flatMap(s=>[s+' D',s+' Y',s+' B',s+' N',s+' %']),...['Genel','İl','İlçe','Kurum'].flatMap(s=>[s+' sıra',s+' %']),'PDF Sayfa','PDF Y'];
  const csv=[header,...rows.map(r=>[r.date,r.title,r.institution,r.number,r.name,r.classroom,r.correct,r.wrong,r.net,r.score,...names.flatMap(name=>{const l=r.lessons.find(l=>l.name===name);return[l?.correct,l?.wrong,l?.blank,l?.net,l?.percent];}),...r.rank.flatMap((v,i)=>[v,r.percentile[i]]),r.source?.page,r.source?.y])].map(row=>row.map(quote).join(';')).join('\r\n');await fs.writeFile(picked.filePath,'\uFEFF'+csv);return true;
 });
 handler('exportIssues',async id=>{const item=pending.get(id);if(!item)throw new Error('PDF analizi bulunamadı.');const picked=await dialog.showSaveDialog(win,{defaultPath:'pdf-inceleme-raporu.json',filters:[{name:'JSON',extensions:['json']}]});if(picked.canceled)return false;await fs.writeFile(picked.filePath,JSON.stringify({source:item.source,hash:item.parsed.hash,analysis:item.parsed.analysis,issues:item.parsed.issues,warnings:item.parsed.warnings},null,2));return true;});
 const create=()=>{win=new BrowserWindow({width:1440,height:980,minWidth:1000,minHeight:720,backgroundColor:'#f5f7fb',title:'Sınav Atlası',icon:path.join(__dirname,'../renderer/assets/icon.png'),autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.loadFile(page);};create();app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)create();});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});app.on('will-quit',()=>store?.close());
