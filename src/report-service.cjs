const {BrowserWindow,dialog,nativeImage}=require('electron');
const fs=require('node:fs/promises');
const os=require('node:os'),path=require('node:path');
const {selectBatchRows,renderBatchReport}=require('./batch-report.cjs');
const {renderReport,reportData}=require('./report.cjs');
function createReportService(store,getWindow){
 const temporaryFiles=new WeakMap();let batchBusy=false;
 const getContext=id=>{const snapshot=store.snapshot();const data=reportData(snapshot,id);const counts=Object.fromEntries(store.db.prepare('SELECT s.name,e.question_count FROM exam_subjects e JOIN subjects s ON s.id=e.subject_id WHERE e.exam_id=?').all(data.current.exam_id).map(r=>[r.name,r.question_count]));const logo=store.db.prepare('SELECT value FROM settings WHERE key=?').get('reportLogo:'+data.current.institution)?.value;return {id,current:data.current,earlier:data.earlier.map(r=>({id:r.id,date:r.date,title:r.title})),counts,logo:logo??null};};
 const build=(id,options={})=>{const context=getContext(id);return renderReport(store.snapshot(),id,{...options,questionCounts:options.questionCounts??context.counts,logo:context.logo});};
 async function reportWindow(html){const report=new BrowserWindow({show:false,width:900,height:1200,parent:getWindow(),webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});report.webContents.setWindowOpenHandler(()=>({action:'deny'}));report.webContents.on('will-navigate',event=>event.preventDefault());try{if(Buffer.byteLength(html,'utf8')>1024*1024){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-report-'));temporaryFiles.set(report,dir);const file=path.join(dir,'report.html');await fs.writeFile(file,html,{mode:0o600});await report.loadFile(file);}else await report.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));await report.webContents.executeJavaScript('document.fonts.ready.then(() => Promise.all(Array.from(document.images, img => img.decode().catch(() => {}))))');return report;}catch(error){await closeReport(report);throw error;}}
 async function closeReport(report){report.destroy();const dir=temporaryFiles.get(report);if(dir){temporaryFiles.delete(report);await fs.rm(dir,{recursive:true,force:true});}}
 function rememberCounts(id,options){if(!options.rememberCounts)return;const context=getContext(id),counts=options.questionCounts??context.counts;store.db.exec('BEGIN');try{for(const lesson of context.current.lessons){const value=counts[lesson.name];store.db.prepare('UPDATE exam_subjects SET question_count=? WHERE exam_id=? AND subject_id=(SELECT id FROM subjects WHERE name=?)').run(value===undefined||value===null||value===''?null:Number(value),context.current.exam_id,lesson.name);}store.db.exec('COMMIT');}catch(e){store.db.exec('ROLLBACK');throw e;}}
 const batchContext=ids=>{const snapshot=store.snapshot(),rows=selectBatchRows(snapshot,ids),context=getContext(rows[0].id);return {exam:snapshot.exams.find(e=>e.id===rows[0].exam_id),count:rows.length,students:rows.map(r=>({id:r.id,name:r.name,number:r.number,classroom:r.classroom})),subjects:[...new Set(rows.flatMap(r=>r.lessons.map(l=>l.name)))],counts:context.counts,hasLogo:!!context.logo};};
 async function batchOutput(ids,options={},print=false){
  if(batchBusy)throw new Error('Bir toplu karne işlemi zaten devam ediyor.');batchBusy=true;
  try{
   const snapshot=store.snapshot(),rows=selectBatchRows(snapshot,ids),context=getContext(rows[0].id);
   const resolved={questionCounts:options.questionCounts??context.counts,rememberCounts:options.rememberCounts===true,comparePrevious:options.comparePrevious??true,includeHistory:options.includeHistory??true,strengths:options.strengths,improvements:options.improvements,message:options.message,logo:context.logo};
   // Validate every report before showing a save/print dialog or writing any output.
   const {html}=renderBatchReport(snapshot,ids,resolved);
   let filePath;
   if(!print){const picked=await dialog.showSaveDialog(getWindow(),{title:'Toplu öğrenci karnelerini PDF kaydet',defaultPath:'toplu-ogrenci-karneleri-'+context.current.date+'.pdf',filters:[{name:'PDF',extensions:['pdf']}]});if(picked.canceled)return false;filePath=picked.filePath;}
   const window=await reportWindow(html);try{
    if(print){const success=await new Promise((resolve,reject)=>window.webContents.print({silent:false,printBackground:true,pageSize:'A4'},(ok,reason)=>ok?resolve(true):/cancel|iptal/i.test(reason??'')?resolve(false):reject(new Error(reason||'Yazdırma tamamlanamadı.'))));if(!success)return false;}
    else{const bytes=await window.webContents.printToPDF({printBackground:true,pageSize:'A4',preferCSSPageSize:true,displayHeaderFooter:false,margins:{top:0,bottom:0,left:0,right:0}});await fs.writeFile(filePath,bytes);}
    rememberCounts(rows[0].id,resolved);return true;
   }finally{await closeReport(window);}
  }finally{batchBusy=false;}
 }
 return {
  batchContext,
  batchPdf:(ids,options)=>batchOutput(ids,options,false),
  batchPrint:(ids,options)=>batchOutput(ids,options,true),
  context:getContext,
  preview:(id,options)=>build(id,options).html,
  logo:async id=>{const context=getContext(id);const picked=await dialog.showOpenDialog(getWindow(),{title:'Okul logosunu seçin',properties:['openFile'],filters:[{name:'Logo görseli',extensions:['png','jpg','jpeg']}]});if(picked.canceled)return null;const file=picked.filePaths[0];if((await fs.stat(file)).size>5*1024*1024)throw new Error('Logo en fazla 5 MB olabilir.');let image=nativeImage.createFromPath(file);if(image.isEmpty())throw new Error('Logo görseli okunamadı.');const size=image.getSize();image=image.resize({width:Math.min(256,size.width),quality:'best'});const logo=image.toDataURL();store.db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('reportLogo:'+context.current.institution,logo);return logo;},
  removeLogo:id=>{const context=getContext(id);store.db.prepare('DELETE FROM settings WHERE key=?').run('reportLogo:'+context.current.institution);return true;},
  pdf:async(id,options={})=>{const {html,data}=build(id,options);const safeName=data.current.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'').slice(0,70);const picked=await dialog.showSaveDialog(getWindow(),{title:'Öğrenci raporunu PDF kaydet',defaultPath:`${safeName}-${data.current.date}-sonuc-raporu.pdf`,filters:[{name:'PDF',extensions:['pdf']}]});if(picked.canceled)return false;const window=await reportWindow(html);try{const pdf=await window.webContents.printToPDF({printBackground:true,pageSize:'A4',preferCSSPageSize:true,displayHeaderFooter:false,margins:{top:0,bottom:0,left:0,right:0}});await fs.writeFile(picked.filePath,pdf);rememberCounts(id,options);return true;}finally{await closeReport(window);}},
  print:async(id,options={})=>{const {html}=build(id,options);const window=await reportWindow(html);try{const printed=await new Promise((resolve,reject)=>window.webContents.print({silent:false,printBackground:true,pageSize:'A4'},(success,reason)=>success?resolve(true):/cancel|iptal/i.test(reason??'')?resolve(false):reject(new Error(reason||'Yazdırma tamamlanamadı.'))));if(printed)rememberCounts(id,options);return printed;}finally{await closeReport(window);}}
 };
}
module.exports={createReportService};
