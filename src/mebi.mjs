// Excel-exported LGS lists: combined subject/metric headers, optional headerless pages.
import validation from './validation.cjs';
const norm=value=>String(value??'').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').replace(/[^a-z0-9]+/g,' ').trim();
const mid=i=>i.x+i.w/2;
const line=(items,y)=>items.filter(i=>Math.abs(i.y-y)<1.2).sort((a,b)=>a.x-b.x);
const aliases={'turkce':'Türkçe','inkilap':'İnkılap Tarihi','inkilap tarihi':'İnkılap Tarihi','t c inkilap tarihi ve ataturkculuk':'İnkılap Tarihi','din':'Din Kültürü','din kulturu':'Din Kültürü','din kulturu ve ahlak bilgisi':'Din Kültürü','ingilizce':'İngilizce','matematik':'Matematik','fen':'Fen Bilimleri','fen bilimleri':'Fen Bilimleri','sosyal bilgiler':'Sosyal Bilgiler'};
const roles={dogru:'correct',yanlis:'wrong',bos:'blank',net:'net'};
function heading(item){
 const text=norm(item.text);
 if(text==='toplam net')return {role:'totalNet'};
 if(['puan','lgs puan','lgs puani'].includes(text))return {role:'score'};
 const match=text.match(/^(.+) (dogru|yanlis|bos|net)$/);
 if(match)return {subject:aliases[match[1]]??item.text.replace(/\s+(Doğru|Yanlış|Boş|Net)$/iu,''),role:roles[match[2]]};
 return null;
}
export function isMebiDocument(document){return document.pages[0]?.items.some(i=>norm(i.text)==='toplam net')&&document.pages[0].items.filter(i=>heading(i)?.subject).length>=6;}
function tableFor(page){
 const anchors=page.items.filter(i=>heading(i)?.subject),best=anchors.map(i=>({y:i.y,count:line(anchors,i.y).length})).sort((a,b)=>b.count-a.count)[0];
 if(!best||best.count<6)throw new Error('Birleşik ders/ölçüm başlıkları eksik.');
 const headers=line(page.items,best.y),identity=['sinif','sube','ad soyad','okul no'].map(label=>headers.find(i=>norm(i.text)===label));
 if(identity.some(i=>!i))throw new Error('Sınıf, şube, ad soyad veya okul no başlığı bulunamadı.');
 const values=headers.filter(i=>heading(i)),columns=values.map((h,i)=>({...heading(h),left:i?(values[i-1].x+values[i-1].w+h.x)/2:(identity[3].x+identity[3].w+h.x)/2,right:i+1<values.length?(h.x+h.w+values[i+1].x)/2:841.89}));
 const names=[...new Set(columns.map(c=>c.subject).filter(Boolean))];
 for(const name of names)for(const role of Object.values(roles))if(columns.filter(c=>c.subject===name&&c.role===role).length!==1)throw new Error(`${name}: doğru/yanlış/boş/net başlıkları eksik veya yinelenmiş.`);
 for(const role of ['totalNet','score'])if(columns.filter(c=>c.role===role).length!==1)throw new Error('Toplam net veya puan başlığı eksik/yinelenmiş.');
 const title=page.items.filter(i=>i.y>best.y+2).sort((a,b)=>b.y-a.y||a.x-b.x).map(i=>i.text).join(' ');
 if(!title)throw new Error('Sınav adı bulunamadı.');
 return {columns,names,identity,y:best.y,title};
}
function number(value){
 const text=String(value??'').trim();if(['','-','—','–'].includes(text))return null;
 if(!/^-?\d+(?:[.,]\d+)?$/.test(text))throw new Error('Sayısal hücre okunamadı.');return Number(text.replace(',','.'));
}
export function analyzeMebiDocument(document){
 const result={hash:document.hash,metadata:{},students:[],averages:{},sourceAverages:{},warnings:[],issues:[],schema:null,analysis:{pages:document.pages.length,detected:0,verified:0,mode:'Birleşik başlıklı LGS sonuç listesi'}};
 const issue=(page,message)=>result.issues.push({page,number:'',message});let reference;
 try{reference=tableFor(document.pages[0]);}catch(e){issue(1,e.message);return validation.revalidateParsed(result);}
 result.metadata={title:reference.title,institution:'',city:'',district:'',grade:null,penalty:3,scoreLabel:'LGS',format:'mebi',participation:[null,null,null,null],rankScopes:['Genel','İl','İlçe','Kurum']};
 result.schema={columns:reference.columns,penalty:3};
 for(const page of document.pages){
  let table=reference,hasHeaders=page.items.some(i=>heading(i)?.subject);
  if(hasHeaders){try{table=tableFor(page);if(table.title!==reference.title||JSON.stringify(table.names)!==JSON.stringify(reference.names))throw new Error('Bu sayfanın sınav adı veya ders listesi ilk sayfadan farklı.');}catch(e){issue(page.number,e.message);continue;}}
  // On continuation pages, require row-shaped content; never interpret another report's headers as students.
  const anchors=[];
  for(const item of page.items.filter(i=>(!hasHeaders||i.y<table.y-2)&&mid(i)<reference.identity[1].x&&/^\d{1,2}$/.test(i.text)))if(!anchors.some(a=>Math.abs(a.y-item.y)<1.2))anchors.push(item);
  anchors.sort((a,b)=>b.y-a.y);
  if(!anchors.length){issue(page.number,'Bu sayfada öğrenci satırı bulunamadı.');continue;}
  const used=new Set();
  for(const anchor of anchors){
   result.analysis.detected++;
   const cells=line(page.items,anchor.y);cells.forEach(i=>used.add(i));
   const identity=cells.filter(i=>mid(i)<table.columns[0].left),grade=identity[0]?.text;
   const branch=identity[1]?.text.match(/^(\d{1,2})\s*\.?\s*S[ıi]n[ıi]f\s*\/\s*(.+?)\s*Şubesi$/iu);
   const noItems=identity.filter(i=>i.x>=table.identity[3].x-2),nameItems=identity.slice(2).filter(i=>!noItems.includes(i));
   const errors=[],lessons=table.names.map(name=>({name,correct:null,wrong:null,blank:null,net:null})),totals={correct:null,wrong:null,net:null,score:null};
   if(!branch||branch[1]!==grade||noItems.length>1)errors.push('Sınıf/şube veya okul numarası hücresi okunamadı.');
   for(const c of table.columns){const matches=cells.filter(i=>mid(i)>=c.left&&mid(i)<c.right);let value=null;if(!matches.length&&['correct','wrong','net'].includes(c.role))value=0;else{try{if(matches.length!==1)throw new Error('Eksik veya birden fazla sayısal hücre.');value=number(matches[0].text);}catch{errors.push(`${c.subject??'Toplam'} ${c.role}: hücreyi kontrol edin.`);}}
    if(c.subject)lessons.find(l=>l.name===c.subject)[c.role]=value;else totals[c.role==='totalNet'?'net':'score']=value;
   }
   for(const key of ['correct','wrong'])if(lessons.every(l=>l[key]!==null))totals[key]=lessons.reduce((sum,l)=>sum+l[key],0);
   const s={number:['','0','-','—'].includes(noItems[0]?.text??'')?null:noItems[0].text,name:nameItems.map(i=>i.text).join(' '),classroom:branch?`${grade}/${branch[2].trim()}`:'',lessons,...totals,rank:[null,null,null,null],percentile:[null,null,null,null],booklet:null,ordinal:result.students.length+1,source:{page:page.number,x:anchor.x,y:anchor.y},reviewRequired:errors.length>0};
   result.students.push(s);if(errors.length)result.warnings.push(`Sayfa ${page.number}, satır ${s.ordinal}: ${errors.join(' ')}`);
  }
  const unclaimed=page.items.filter(i=>(!hasHeaders||i.y<table.y-2)&&!used.has(i));
  if(unclaimed.length)issue(page.number,'Tablo altında veya devam sayfasında eşleştirilemeyen metin var. Eksik satır olasılığı için belgeyi kontrol edin.');
 }
 const grades=[...new Set(result.students.map(s=>s.classroom.split('/')[0]).filter(Boolean))];if(grades.length===1)result.metadata.grade=grades[0];
 result.warnings.push('Bu listede kurum bilgisi yok. Veritabanına kaydetmeden önce “Sınav bilgilerini düzenle” ile kurum adını girin; varsa il ve ilçeyi tamamlayın.','Katılım, sıralama, yüzdelikler ve kaynak genel/okul ortalamaları bu formatta verilmediği için boş bırakıldı. Toplam doğru/yanlış derslerden toplandı; toplam net ve puan kaynaktan korundu.');
 if(result.students.some(s=>!s.number))result.warnings.push('Numarası olmayan öğrenciler ayrı kimliklerle saklanır; aynı kişi oldukları varsayılmaz.');
 return validation.revalidateParsed(result);
}
