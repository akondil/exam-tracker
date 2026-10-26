// Shared by PDF review and SQLite writes: the renderer cannot bypass validation.
function validateStudent(s,penalty=3){
 const errors=[];
 if(s.reviewRequired)errors.push('Okunamayan alanları kontrol edip kaydedin.');
 if(typeof s.name!=='string'||!s.name.trim())errors.push('Öğrenci adı zorunludur.');
 if(s.number!=null&&s.number!==''&&!/^\d+$/.test(String(s.number)))errors.push('Okul numarası yalnızca rakamlardan oluşmalıdır.');
 if(!/^\d{1,2}\/[\p{L}\d]+$/u.test(s.classroom??''))errors.push('Sınıf / şube 7/A biçiminde olmalıdır.');
 if(!Array.isArray(s.lessons)||!s.lessons.length){errors.push('Ders sonuçları eksik.');return errors;}
 const names=new Set();
 for(const l of s.lessons){
  if(!l.name?.trim()||names.has(l.name))errors.push('Ders adı eksik veya yinelenmiş.');names.add(l.name);
  if(!Number.isInteger(l.correct)||l.correct<0||!Number.isInteger(l.wrong)||l.wrong<0||!Number.isFinite(l.net))errors.push(`${l.name}: doğru/yanlış/net alanı eksik veya geçersiz.`);
  else if(Math.abs(l.net-(l.correct-(penalty?l.wrong/penalty:0)))>.025)errors.push(`${l.name}: doğru/yanlış/net değerleri tutarsız.`);
  if(l.blank!=null&&(!Number.isInteger(l.blank)||l.blank<0))errors.push(`${l.name}: boş sayısı geçersiz.`);
  if(l.percent!=null&&(!Number.isFinite(l.percent)||l.percent<0||l.percent>100))errors.push(`${l.name}: yüzde 0–100 arasında olmalıdır.`);
 }
 for(const field of ['correct','wrong','net']){const sum=s.lessons.reduce((v,l)=>v+l[field],0);if(!Number.isFinite(s[field])||Math.abs(sum-s[field])>(field==='net'?Math.max(.08,s.lessons.length*.012):.01))errors.push(`Toplam ${field} değeri derslerle eşleşmiyor.`);}
 if(s.score!=null&&(!Number.isFinite(s.score)||s.score<0||s.score>500))errors.push('Puan 0–500 arasında olmalıdır.');
 for(const [key,label]of [['rank','Sıralama'],['percentile','Yüzdelik']]){if(!Array.isArray(s[key])||s[key].length!==4){errors.push(`${label} alanları eksik.`);continue;}for(const v of s[key])if(v!=null&&(!Number.isFinite(v)||(key==='rank'?(!Number.isInteger(v)||v<1):(v<0||v>100))))errors.push(`${label} değeri geçersiz.`);}
 return errors;
}
function validateMetadata(m){
 const errors=[];if(!m.title?.trim()||!m.institution?.trim())errors.push('Sınav adı ve kurum zorunludur.');
 if(![0,3,4].includes(m.penalty??3))errors.push('Net hesaplama kuralı geçersiz.');
 if(!Array.isArray(m.participation)||m.participation.length!==4||m.participation.some(v=>v!=null&&(!Number.isInteger(v)||v<0)))errors.push('Katılım bilgileri pozitif tam sayı veya boş olmalıdır.');
 return errors;
}
function revalidateParsed(parsed){
 parsed.issues=(parsed.issues??[]).filter(i=>i.kind!=='validation');
 const add=(message,index)=>{const s=parsed.students[index];parsed.issues.push({kind:'validation',index,page:s?.source?.page??1,number:s?.number??'',message});};
 validateMetadata(parsed.metadata).forEach(m=>add(m));
 const seen=new Set();let valid=0;
 parsed.students.forEach((s,index)=>{const errors=validateStudent(s,parsed.metadata.penalty??3);if(parsed.metadata.grade&&s.classroom.split('/')[0]!==parsed.metadata.grade)errors.push('Öğrenci sınıf seviyesi sınav bilgisiyle eşleşmiyor.');if(s.number&&s.number!=='0'){if(seen.has(s.number))errors.push('Öğrenci numarası dosyada yineleniyor.');seen.add(s.number);}errors.forEach(m=>add(m,index));if(!errors.length)valid++;});
 if(parsed.metadata.participation?.[3]!=null&&parsed.metadata.participation[3]!==parsed.analysis.detected)add('Kurum katılımı ile tespit edilen öğrenci sayısı eşleşmiyor.');
 parsed.analysis.verified=valid;return parsed;
}
function assertDate(date){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new Error('Geçerli sınav tarihi seçin.');}
module.exports={validateStudent,validateMetadata,revalidateParsed,assertDate};
function studentPatch(base,input){
 if(!input||typeof input!=='object')throw new Error('Geçersiz düzenleme.');
 const result=structuredClone(base);if('rank'in input&&'percentile'in input)result.reviewRequired=false;
 for(const key of ['name','classroom','number','booklet'])if(key in input){if(input[key]!=null&&typeof input[key]!=='string')throw new Error('Öğrenci alanları metin olmalıdır.');result[key]=(input[key]??'').trim();}
 result.number=!result.number||/^0+$/.test(result.number)?null:result.number;
 result.classroom=result.classroom.replace(/\s/g,'').replace(/^(\d+)([\p{L}]+)$/u,'$1/$2').toLocaleUpperCase('tr-TR');
 const value=v=>{if(v!==null&&(typeof v!=='number'||!Number.isFinite(v)))throw new Error('Geçerli sayısal değer veya boş alan kullanın.');return v;};
 for(const key of ['correct','wrong','net','score'])if(key in input)result[key]=value(input[key]);
 for(const key of ['rank','percentile'])if(key in input){if(!Array.isArray(input[key])||input[key].length!==4)throw new Error('Sıralama alanları eksik.');result[key]=input[key].map(value);}
 if(input.lessons){if(!Array.isArray(input.lessons)||input.lessons.length!==base.lessons.length)throw new Error('Ders listesi değiştirilemez.');result.lessons=base.lessons.map((l,i)=>{const next={...l};for(const key of ['correct','wrong','net','blank','percent'])if(key in input.lessons[i])next[key]=value(input.lessons[i][key]);return next;});}
 return result;
}
function examPatch(base,input){
 const m=structuredClone(base);
 for(const key of ['title','institution','city','district','grade'])if(key in input){if(typeof input[key]!=='string')throw new Error('Sınav alanları metin olmalıdır.');m[key]=input[key].trim();}
 if('penalty'in input)m.penalty=input.penalty;
 if('participation'in input)m.participation=input.participation;
 const errors=validateMetadata(m);if(errors.length)throw new Error(errors.join('\n'));
 return m;
}
function validateAverages(averages,names){
 for(const scope of ['general','school']){const a=averages?.[scope];if(!a)continue;
  if(!Array.isArray(a.lessons)||a.lessons.length!==names.length||a.lessons.some((l,i)=>l.name!==names[i]))throw new Error('Ortalama ders listesi geçersiz.');
  for(const l of [a,...a.lessons])for(const key of ['correct','wrong','net','score']){const v=l[key];if(v!=null&&(!Number.isFinite(v)||(key!=='net'&&v<0)||(key==='score'&&v>500)))throw new Error('Kaynak ortalaması geçersiz.');}
 }
}
module.exports={...module.exports,studentPatch,examPatch,validateAverages};
