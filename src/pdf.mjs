import fs from 'node:fs/promises';
import validation from './validation.cjs';
import {createHash} from 'node:crypto';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';

export const subjects=['Türkçe','Sosyal Bilgiler','Din Kültürü','İngilizce','Matematik','Fen Bilimleri'];
const normalize=value=>String(value??'').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').replace(/[^a-z0-9]+/g,' ').trim();
const canonical=name=>({sosyal:'Sosyal Bilgiler',din:'Din Kültürü',fen:'Fen Bilimleri'})[normalize(name)]??[...subjects,'İnkılap Tarihi'].find(s=>normalize(s)===normalize(name))??name.trim();
const center=item=>item.x+item.w/2;
const row=(items,y,tolerance=1.8)=>items.filter(i=>Math.abs(i.y-y)<tolerance).sort((a,b)=>a.x-b.x);
const metric=text=>({d:'correct',dogru:'correct',y:'wrong',yanlis:'wrong',n:'net',net:'net',b:'blank',bos:'blank'})[normalize(text)];
export function numeric(value){
 const text=String(value??'').trim();
 if(['','-','—','–','null','None'].includes(text))return null;
 if(!/^%?\s*-?\d+(?:[.,]\d+)?\s*%?$/.test(text))throw new Error(`Sayısal değer okunamadı: ${text}`);
 const result=Number(text.replace(/%/g,'').replace(/\s/g,'').replace(',','.'));
 if(!Number.isFinite(result))throw new Error(`Sayısal değer okunamadı: ${text}`);
 return result;
}
function integer(value){const text=String(value??'').trim();return numeric(/^\d{1,3}(?:[. ]\d{3})+$/.test(text)?text.replace(/[. ]/g,''):text);}
export async function readPdf(file){
 const bytes=await fs.readFile(file),task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true});
 try{
  const pdf=await task.promise;if(pdf.numPages>200)throw new Error('En fazla 200 sayfalık PDF destekleniyor.');
  const pages=[];
  for(let number=1;number<=pdf.numPages;number++){
   const page=await pdf.getPage(number),scale=841.89/page.getViewport({scale:1}).width,content=await page.getTextContent();
   pages.push({number,items:content.items.filter(i=>i.str?.trim()).map(i=>({text:i.str.trim(),x:i.transform[4]*scale,y:i.transform[5]*scale,w:i.width*scale}))});
  }
  return {hash:createHash('sha256').update(bytes).digest('hex'),pages};
 }finally{await task.destroy();}
}
function layout(page){
 const foy=page.items.some(i=>i.text==='KT')&&page.items.some(i=>i.text==='Sr');
 const items=page.items,anchors=items.filter(i=>metric(i.text));
 const best=anchors.map(i=>({y:i.y,count:row(anchors,i.y).length})).sort((a,b)=>b.count-a.count)[0];
 if(!best||best.count<6)throw new Error('Derslerin D/Y/N başlıkları bulunamadı. Metin içeren kurum sonuç listesi kullanın.');
 const headers=row(items,best.y).filter(i=>metric(i.text)||(foy&&i.text==='P')||/^(puan|lgs puan[ıi]?)$/.test(normalize(i.text)));
 const parents=items.filter(i=>i.y>best.y+(foy?8:3)&&i.y<best.y+(foy?20:32));
 const columns=[];let subject=null,total=false;
 for(const h of headers){
  const role=foy&&h.text==='P'?'percent':metric(h.text);
  if(role==='correct'){
   const parent=parents.filter(i=>!/^(no|ogr|snf|sinif)/.test(normalize(i.text))).sort((a,b)=>Math.abs(center(a)-center(h))-Math.abs(center(b)-center(h)))[0];
   if(!parent||Math.abs(center(parent)-center(h))>65)throw new Error('Ders başlıkları sütunlarla eşleştirilemedi.');
   total=normalize(parent.text)==='toplam';subject=total?null:canonical(parent.text);
  }
  if(role)columns.push({x:center(h),role:total?'total'+role[0].toUpperCase()+role.slice(1):role,subject});
  else columns.push({x:center(h),role:'score',subject:null});
 }
 const names=[...new Set(columns.filter(c=>c.subject).map(c=>c.subject))];
 if(!names.length||columns.filter(c=>c.role==='score').length!==1)throw new Error('Ders veya LGS puan sütunları eksik.');
 for(const name of names)for(const required of ['correct','wrong','net'])if(columns.filter(c=>c.subject===name&&c.role===required).length!==1)throw new Error(`${name}: D/Y/N sütunları eksik veya yinelenmiş.`);
 for(const role of ['totalCorrect','totalWrong','totalNet'])if(columns.filter(c=>c.role===role).length!==1)throw new Error('Toplam D/Y/N sütunları eksik.');
 const ranks=foy?null:['genel','il','ilce','kurum'].map(scope=>{
  const heading=parents.find(i=>normalize(i.text)===scope&&center(i)>columns.at(-1).x);
  if(!heading)throw new Error(`${scope}: sıralama başlığı bulunamadı.`);return center(heading);
 });
 return {columns,names,ranks,foy,y:best.y,identityMax:columns[0].x-12};
}
function foyIdentity(page,y,table){
 const labels=['Sr','Sınıf','No','Adı Soyadı','KT'],headers=labels.map(text=>page.items.find(i=>normalize(i.text)===normalize(text)&&i.y>table.y&&i.y<table.y+10));
 if(headers.some(h=>!h))return null;
 const cells=row(page.items,y),values=headers.map((h,index)=>{const left=index?(index===3?h.x-2:(center(headers[index-1])+center(h))/2):0,right=index+1<headers.length?(index===2?headers[3].x-2:index===3?headers[4].x-3:(center(h)+center(headers[index+1]))/2):table.identityMax;return cells.filter(i=>center(i)>=left&&center(i)<right).map(i=>i.text).join(' ');});
 const [ordinal,cls,number,name,booklet]=values;if(!/^\d+$/.test(ordinal))return null;const c=cls.match(/^(\d+)\s*\/?\s*(.*)$/u);
 return ['',ordinal,c?.[1]??'',c?.[2]??'',number,name,booklet];
}
function cellsAt(page,y,columns,errors=null){
 const cells=row(page.items,y),values=[];
 for(let idx=0;idx<columns.length;idx++){
  const column=columns[idx],left=idx?(columns[idx-1].x+column.x)/2:column.x-(columns[1].x-column.x)/2,right=idx+1<columns.length?(column.x+columns[idx+1].x)/2:column.x+18;
  const matches=cells.filter(i=>center(i)>=left&&center(i)<right);
  try{if(matches.length>1)throw new Error('Aynı sayısal sütunda birden fazla değer bulundu.');values.push(numeric(matches[0]?.text));}catch(error){if(!errors)throw error;errors.push(error.message);values.push(null);}
 }
 return values;
}
function getMetadata(page,table){
 if(table.foy){
  const pick=label=>{const h=page.items.find(i=>normalize(i.text)===label&&i.y>table.y+30&&i.x<160);if(!h)return '';return row(page.items,h.y).filter(i=>i.x>h.x+20&&i.x<(label==='il'||label==='ilce'?115:400)).map(i=>i.text).join(' ').replace(/^:\s*/,'');};
  const p=page.items.find(i=>normalize(i.text)==='okul'&&i.x>600&&i.y>table.y+30),v=p?page.items.find(i=>Math.abs(center(i)-center(p))<10&&i.y<p.y&&i.y>p.y-20):null;
  return {title:pick('sinav'),institution:pick('okul'),city:pick('il'),district:pick('ilce'),participation:[null,null,null,integer(v?.text)],grade:null,penalty:0,scoreLabel:'TFDMIS',format:'foy'};
 }

 const titleHeader=page.items.find(i=>normalize(i.text)==='sinav adi');
 if(!titleHeader)throw new Error('Sınav adı üst başlığı bulunamadı.');
 const labels=row(page.items,titleHeader.y).filter(i=>['il','ilce','kurum','sinav adi'].includes(normalize(i.text)));
 const ordered=labels.toSorted((a,b)=>center(a)-center(b));
 const pickColumn=header=>{const index=ordered.findIndex(h=>normalize(h.text)===normalize(header.text)),x=center(header),left=index?(center(ordered[index-1])+x)/2:0,right=index+1<ordered.length?(x+center(ordered[index+1]))/2:(x+table.ranks[0])/2;return page.items.filter(i=>i.y<titleHeader.y-5&&i.y>table.y+30&&center(i)>=left&&center(i)<right).sort((a,b)=>Math.abs(a.y-b.y)>1.8?b.y-a.y:a.x-b.x);};
 const titleValues=pickColumn(titleHeader);if(!titleValues.length)throw new Error('Sınav adı değeri okunamadı.');
 const titleText=titleValues.map(i=>i.text).join(' '),line=row(page.items,titleValues[0].y),values={};
 for(const h of ordered)values[normalize(h.text)]=pickColumn(h).map(i=>i.text).join(' ');
 if(!values.kurum||!values.il||!values.ilce)throw new Error('İl, ilçe veya kurum bilgileri okunamadı.');
 const participation=table.ranks.map(x=>{
  const near=line.filter(i=>Math.abs(center(i)-x)<17).sort((a,b)=>Math.abs(center(a)-x)-Math.abs(center(b)-x));
  const value=integer(near[0]?.text);if(value!==null&&(!Number.isInteger(value)||value<0))throw new Error('Katılım sayısı geçersiz.');return value;
 });
 return {title:titleText,institution:values.kurum,city:values.il,district:values.ilce,participation,penalty:3,grade:titleText.match(/(\d+)\s*\.?\s*s[ıi]n[ıi]f/i)?.[1]??null};
}
function ranking(page,y,centers){
 if(!centers)return {rank:[null,null,null,null],percentile:[null,null,null,null]};
 const rank=[],percentile=[];
 for(let n=0;n<4;n++){
  const left=n?(centers[n-1]+centers[n])/2:centers[n]-(centers[1]-centers[0])/2,right=n<3?(centers[n]+centers[n+1])/2:centers[n]+(centers[n]-centers[n-1])/2;
  const items=page.items.filter(i=>Math.abs(i.y-y)<7&&center(i)>=left&&center(i)<right);
  const numbers=items.filter(i=>!i.text.includes('%')),percents=items.filter(i=>i.text.includes('%'));
  if(numbers.length>1||percents.length>1)throw new Error('Sıra/yüzdelik sütunlarında birden fazla değer bulundu.');
  const value=integer(numbers[0]?.text),percent=numeric(percents[0]?.text);
  if(value!==null&&(!Number.isInteger(value)||value<1))throw new Error('Sıralama değeri geçersiz.');
  if(percent!==null&&(percent<0||percent>100))throw new Error('Yüzdelik dilim geçersiz.');
  rank.push(value);percentile.push(percent);
 }
 return {rank,percentile};
}
function average(page,table,label){
 const anchor=page.items.find(i=>normalize(i.text)===normalize(label));if(!anchor)return null;
 const raw=cellsAt(page,anchor.y,table.columns),lessons=table.names.map(name=>({name,correct:null,wrong:null,net:null})),totals={correct:null,wrong:null,net:null,score:null};
 table.columns.forEach((c,i)=>{if(c.subject)lessons.find(l=>l.name===c.subject)[c.role]=raw[i];else if(c.role==='score')totals.score=raw[i];else if(c.role.startsWith('total'))totals[c.role.slice(5).toLowerCase()]=raw[i];});
 // Source averages have independent rounding; never apply student net checks to them.
 return {lessons,...totals,raw};
}
export function analyzeDocument(document){
 const result={hash:document.hash,students:[],metadata:{},averages:{},sourceAverages:{},warnings:[],issues:[],analysis:{pages:document.pages.length,detected:0,verified:0,mode:'Kurum sonuç listesi'},schema:null};
 const issue=(page,number,message,source)=>result.issues.push({page,number,message,source});
 let reference=null,rowsCount=0;
 for(const page of document.pages){
  let table,meta;
  try{table=layout(page);meta=getMetadata(page,table);
   if(!reference){reference=table;result.schema={columns:table.columns,penalty:3};result.metadata=meta;}
   else if(meta.title!==result.metadata.title||meta.institution!==result.metadata.institution||meta.city!==result.metadata.city||meta.district!==result.metadata.district||JSON.stringify(meta.participation)!==JSON.stringify(result.metadata.participation))throw new Error('Bu sayfanın sınav/kurum/katılım bilgisi ilk sayfadan farklı.');
   if(JSON.stringify(table.names)!==JSON.stringify(reference.names))throw new Error('Bu sayfanın ders listesi ilk sayfadan farklı.');
   for(const [label,scope]of [['Genel Ortalama','general'],['Okul Ortalaması','school']]){
    const a=average(page,table,label);if(!a){if(page.number===1&&!table.foy)throw new Error(`${label} satırı bulunamadı.`);continue;}
    if(!result.sourceAverages[scope]){result.sourceAverages[scope]=a;result.averages[scope]=a.raw;}
    else if(JSON.stringify(result.sourceAverages[scope].raw)!==JSON.stringify(a.raw))throw new Error(`${label} sonraki sayfada farklı değerler içeriyor.`);
   }
  }catch(error){issue(page.number,'',error.message);continue;}
  const anchors=[];
  for(const item of page.items.filter(i=>i.y<table.y-(table.foy?7:12)&&i.x<table.identityMax&&(table.foy?/^\d+$/:/^\d/).test(i.text)))if(!anchors.some(a=>Math.abs(a.y-item.y)<1.8))anchors.push(item);
  for(const anchor of anchors){
   result.analysis.detected++;rowsCount++;
   const left=row(page.items,anchor.y).filter(i=>i.x<table.identityMax).map(i=>i.text).join(' '),source={page:page.number,x:anchor.x,y:anchor.y};
   // PDF.js may join row number, name and even class with no intervening space.
   const match=table.foy?foyIdentity(page,anchor.y,table):left.match(/^(\d+)\s+(\d+)\s*[-–—]\s*(.+?)\s*(\d+\s*\/\s*[^\s]+)$/);
   if(!match){issue(page.number,'',`Öğrenci kimliği okunamadı: ${left}`,source);continue;}
   const [,ordinal]=match,number=table.foy?(match[4]==='0'?null:match[4]):(match[2]==='0'?null:match[2]),name=table.foy?match[5]:match[3],classroom=table.foy?match[2]+'/'+match[3]:match[4].replace(/\s/g,'');
   if(Number(ordinal)!==rowsCount)issue(page.number,number,`Satır sırası beklenen ${rowsCount} yerine ${ordinal}. Eksik/tekrarlı satır olabilir.`,source);
   const lessons=table.names.map(name=>({name,correct:null,wrong:null,net:null,blank:null})),totals={correct:null,wrong:null,net:null,score:null};
   let cellErrors=[];
   try{
    const values=cellsAt(page,anchor.y,table.columns,cellErrors);
    table.columns.forEach((c,i)=>{if(c.subject)lessons.find(l=>l.name===c.subject)[c.role]=values[i];else if(c.role==='score')totals.score=values[i];else totals[c.role.slice(5).toLowerCase()]=values[i];});
   }catch(error){result.warnings.push(`Sayfa ${page.number}, satır ${ordinal}: ${error.message} Sayısal alanları düzenleyin.`);}
   if(cellErrors.length)result.warnings.push(`Sayfa ${page.number}, satır ${ordinal}: ${cellErrors.join(' ')} Okunamayan alanlar boş bırakıldı; düzenleyin.`);
   let ranks,reviewRequired=cellErrors.length>0;try{ranks=ranking(page,anchor.y,table.ranks);}catch(error){result.warnings.push(`Sayfa ${page.number}, satır ${ordinal}: ${error.message} Sıralamaları düzenleyin.`);reviewRequired=true;ranks={rank:[null,null,null,null],percentile:[null,null,null,null]};}
   result.students.push({number,name,classroom,reviewRequired,lessons,...totals,...ranks,booklet:table.foy?match[6]:null,ordinal:Number(ordinal),source});
  }
 }
 if(!result.analysis.detected)issue(1,'','Öğrenci satırı bulunamadı. Taranmış PDF yerine metin içeren kurum sonuç listesi kullanın.');

 if(result.metadata.format==='foy'){
  result.schema.penalty=0;
  const grades=[...new Set(result.students.map(s=>s.classroom.split('/')[0]))];if(grades.length===1)result.metadata.grade=grades[0];
  result.warnings.push('Bu föyde yanlışlar netten düşülmüyor. Derslerin P sütunu kaynak yüzdesi olarak korunur. Genel/okul alt özetlerinin metrikleri belirtilmediğinden D/Y/N ortalamaları olarak yorumlanmaz.');
  result.metadata.sourceSummary={};
  for(const page of document.pages)for(const [scope,label]of [['general','Genel'],['school','Okul']]){
   const anchor=page.items.find(i=>i.text===label&&i.y<400);if(anchor)result.metadata.sourceSummary[scope]=row(page.items,anchor.y).filter(i=>i.x>anchor.x+anchor.w).map(i=>({value:numeric(i.text),x:i.x}));
  }
 }
 if(result.students.some(s=>!s.number))result.warnings.push('Okul numarası 0 veya boş olan öğrenciler ayrı kimliklerle saklanır; aynı kişi oldukları varsayılmaz. Numarayı daha sonra tamamlayabilirsiniz.');
 if(result.metadata.participation?.some(v=>v===null))result.warnings.push('Kaynakta “-” olan katılım bilgileri boş saklanacak.');
 if(result.students.some(s=>s.rank.some(v=>v===null)))result.warnings.push('Eksik sıralamalar boş saklanır; kaynakta verilen %0 dahil yüzdelikler korunur.');
 if(result.students.some(s=>s.score===null))result.warnings.push('Puanı bulunmayan sonuçlar puan ortalaması ve başarı oranına dahil edilmez.');
 result.warnings.push('Kaynak PDF’de kesilmiş adlar tamamlanmaz. Ders adları başlıklardan alınır; Sosyal Bilgiler ve İnkılap Tarihi ayrı tutulur.');
 return validation.revalidateParsed(result);
}
export async function parsePdf(file,{strict=true}={}){const result=analyzeDocument(await readPdf(file));if(strict&&result.issues.length)throw new Error(result.issues.map(i=>`Sayfa ${i.page}, öğrenci ${i.number}: ${i.message}`).join('\n'));return result;}
