const {renderReport}=require('./report.cjs');
function selectBatchRows(snapshot,ids){
 if(!Array.isArray(ids)||!ids.length||ids.length>1000||ids.some(id=>!Number.isInteger(id)||id<1)||new Set(ids).size!==ids.length)throw new Error('Toplu karne için 1–1000 farklı sonuç seçin.');
 const index=new Map(snapshot.rows.map(r=>[r.id,r])),rows=ids.map(id=>index.get(id));
 if(rows.some(r=>!r))throw new Error('Seçilen sonuçlardan biri artık bulunamıyor. Listeyi yenileyin.');
 if(new Set(rows.map(r=>r.exam_id)).size!==1)throw new Error('Toplu karne için tek bir sınav seçin.');
 return rows.sort((a,b)=>a.classroom.localeCompare(b.classroom,'tr',{numeric:true})||(Number(a.number==null)-Number(b.number==null))||String(a.number??'').localeCompare(String(b.number??''),'tr',{numeric:true})||a.name.localeCompare(b.name,'tr')||a.id-b.id);
}
function renderBatchReport(snapshot,ids,options={}){
 const rows=selectBatchRows(snapshot,ids);
 if(options.comparePrevious!==undefined&&typeof options.comparePrevious!=='boolean')throw new Error('Karşılaştırma seçeneği geçersiz.');
 let template=null;const bodies=[];let pages=0;
 for(const row of rows){
  const {html}=renderReport(snapshot,row.id,{...options,baselineId:options.comparePrevious===false?null:undefined});
  const start=html.indexOf('<body>')+6,end=html.lastIndexOf('</body>');
  if(start<6||end<start)throw new Error('Karne belgesi hazırlanamadı.');
  template??=html;const body=html.slice(start,end);bodies.push(body);pages+=(body.match(/<article class="sheet(?: [^"]*)?">/g)??[]).length;
 }
 return {html:template.replace(/<body>[\s\S]*<\/body>/,()=>'<body>'+bodies.join('')+'</body>').replace(/<title>[\s\S]*?<\/title>/,'<title>Toplu Öğrenci Karneleri</title>'),count:rows.length,pageCount:pages,ids:rows.map(r=>r.id)};
}
module.exports={selectBatchRows,renderBatchReport};
