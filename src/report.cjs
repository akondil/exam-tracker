const fs = require('node:fs');
const path = require('node:path');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format = (value, digits = 2) => Number.isFinite(value) ? value.toLocaleString('tr-TR', {maximumFractionDigits: digits}) : '—';
const date = value => value.split('-').reverse().join('/');
const styleIndex=(name,index)=>{const normalized=name.toLocaleLowerCase('tr-TR');if(/türk|turk/.test(normalized))return 0;if(/matematik/.test(normalized))return 1;if(/fen|fizik|kimya|biyoloji/.test(normalized))return 2;if(/sosyal|inkılap|tarih|coğrafya/.test(normalized))return 3;if(/ingiliz|english|yabancı/.test(normalized))return 4;if(/din|ahlak/.test(normalized))return 5;return index%6;};
const colors = ['#df527c', '#ee9d38', '#69a84b', '#9560b9', '#288eb8', '#15a59d'];
const icons = [
 '<path d="M12 6c-3-2-7-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-2-1-6-1-9 1zm0 0v14M6 8h3m-3 4h3m6-4h3m-3 4h3"/>',
 '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8M8 10h1m3 0h1m3 0h1M8 14h1m3 0h1m3 0h1M8 18h1m3 0h1m3 0h1"/>',
 '<path d="M9 2h6m-5 0v7L4 19q-1 3 3 3h10q4 0 3-3L14 9V2M8 15h8m-6 3h1m3 1h1"/>',
 '<circle cx="8" cy="7" r="3"/><circle cx="17" cy="8" r="2.5"/><path d="M2 21v-4q0-5 6-5t6 5v4m1-8q7 0 7 5v3"/>',
 '<circle cx="12" cy="12" r="10"/><ellipse cx="12" cy="12" rx="4" ry="10"/><path d="M3 7h18M2 12h20M3 17h18"/>',
 '<path d="M4 21V11l8-6 8 6v10M3 21h18M8 21v-7h8v7M12 5V2m0 0h3"/>'
];
function icon(index, size = 24) { return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[index % icons.length]}</svg>`; }
function reportData(snapshot, resultId, options = {}) {
 if (!Number.isInteger(resultId)) throw new Error('Geçerli öğrenci sonucu seçin.');
 const current = snapshot.rows.find(r => r.id === resultId);
 if (!current) throw new Error('Öğrenci sonucu bulunamadı.');
 const exam = snapshot.exams.find(e => e.id === current.exam_id);
 const earlier = snapshot.rows.filter(r => r.student_id === current.student_id && (r.date < current.date || r.date === current.date && r.exam_id < current.exam_id)).sort((a,b) => b.date.localeCompare(a.date) || b.exam_id-a.exam_id);
 const history=[...earlier,current].sort((a,b)=>a.date.localeCompare(b.date)||a.exam_id-b.exam_id);
 const historySubjects=[...new Set(history.flatMap(r=>r.lessons.map(l=>l.name)))];
 if(options.includeHistory!==undefined&&typeof options.includeHistory!=='boolean')throw new Error('Sınav geçmişi seçeneği geçersiz.');
 let baseline;
 if (options.baselineId === null || options.baselineId === '') baseline = null;
 else if (options.baselineId === undefined) baseline = earlier[0] ?? null;
 else { baseline = earlier.find(r => r.id === options.baselineId); if (!baseline) throw new Error('Karşılaştırma sınavı aynı öğrencinin önceki bir sonucu olmalıdır.'); }
 const counts = options.questionCounts ?? {};
 const lessons = current.lessons.map((l, index) => {
  const raw = counts[l.name]; const questionCount = raw === '' || raw === null || raw === undefined ? null : Number(raw);
  if (questionCount !== null && (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 1000)) throw new Error(`${l.name}: soru sayısı 1–1000 arasında tam sayı olmalıdır.`);
  if (questionCount !== null && l.correct + l.wrong + (l.blank ?? 0) > questionCount) throw new Error(`${l.name}: soru sayısı doğru, yanlış ve boş toplamından küçük olamaz.`);
  if(questionCount!==null&&options.rememberCounts&&snapshot.rows.filter(r=>r.exam_id===current.exam_id).some(r=>r.lessons.some(other=>other.name===l.name&&other.correct+other.wrong+(other.blank??0)>questionCount)))throw new Error(`${l.name}: soru sayısı aynı sınavdaki diğer sonuçlarla çelişiyor.`);
  if (questionCount !== null && l.blank !== null && l.blank !== undefined && l.correct+l.wrong+l.blank !== questionCount) throw new Error(`${l.name}: soru sayısı doğru, yanlış ve boş toplamıyla eşleşmiyor.`);
  const previous = baseline?.lessons.find(b => b.name === l.name);
  return {...l, index:styleIndex(l.name,index), questionCount, blank: l.blank ?? (questionCount === null ? null : questionCount-l.correct-l.wrong), rate: questionCount === null ? null : l.net/questionCount*100, previousNet: previous?.net ?? null, delta: previous ? Math.round((l.net-previous.net)*100)/100 : null};
 }).sort((a,b)=>a.index-b.index);
 const allCounts = lessons.every(l => l.questionCount !== null);
 const totalQuestions = allCounts ? lessons.reduce((s,l)=>s+l.questionCount,0) : null;
 const rate = totalQuestions ? current.net/totalQuestions*100 : null;
 const deltaLessons = lessons.filter(l => Number.isFinite(l.delta));
 const delta = deltaLessons.length ? Math.round(deltaLessons.reduce((s,l)=>s+l.delta,0)*100)/100 : null;
 const note = key => { const text = String(options[key] ?? '').trim(); if (text.length > 400) throw new Error('Her öğretmen notu en fazla 400 karakter olabilir.'); return text; };
 const top = [...lessons].sort((a,b)=>allCounts ? b.rate-a.rate : b.net-a.net).slice(0,2);
 const focus = [...lessons].sort((a,b)=>b.wrong-a.wrong).filter(l=>l.wrong>0).slice(0,2);
 const strengths = note('strengths') || (allCounts ? 'En yüksek net/soru oranları: ' : 'En yüksek ham netler: ') + top.map(l=>`${l.name} (${allCounts?'%'+format(l.rate,1):format(l.net)+' net'})`).join(', ') + '.';
 const improvements = note('improvements') || (focus.length ? 'Yanlışların gözden geçirilebileceği dersler: '+focus.map(l=>`${l.name} (${format(l.wrong,0)} yanlış)`).join(', ')+'.' : 'Bu sınavda kaydedilmiş yanlış cevap yok. Boş ve net alanlarını da birlikte değerlendirin.');
 const message = note('message') || 'Her sınav, bir sonraki adımı planlamak için bir fırsattır. Sonuçlarını incele, hatalarını gözden geçir ve düzenli çalışmaya devam et.';
 return {current,exam,baseline,earlier,history,historySubjects,includeHistory:options.includeHistory!==false,lessons,totalQuestions,rate,delta,deltaLessons,strengths,improvements,message};
}
function barChart(lessons, baseline) {
 const width=300, height=168, left=24, right=8, top=18, bottom=35;
 const values=lessons.flatMap(l=>[l.net, l.previousNet]).filter(Number.isFinite);
 const min=Math.min(0,...values), max=Math.max(1,...values)*1.18;
 const scale=v=>top+(max-v)/(max-min)*(height-top-bottom), zero=scale(0);
 const step=(width-left-right)/lessons.length, bw=Math.min(16,step/3);
 let svg='';
 for(let n=0;n<=4;n++){const v=min+(max-min)*n/4,y=scale(v);svg+=`<line x1="${left}" x2="${width-right}" y1="${y}" y2="${y}" stroke="#e3edf2"/><text x="${left-4}" y="${y+3}" text-anchor="end" fill="#8299a8" font-size="8">${format(v,0)}</text>`;}
 lessons.forEach((l,i)=>{const x=left+step*(i+.5),color=colors[l.index%6];if(baseline&&Number.isFinite(l.previousNet)){const y=scale(l.previousNet);svg+=`<rect x="${x-bw-1}" y="${Math.min(y,zero)}" width="${bw}" height="${Math.max(1,Math.abs(zero-y))}" rx="2" fill="${color}" opacity=".3"/>`;}
 const y=scale(l.net);svg+=`<rect x="${baseline?x+1:x-bw/2}" y="${Math.min(y,zero)}" width="${bw}" height="${Math.max(1,Math.abs(zero-y))}" rx="2" fill="${color}"/><text x="${baseline?x+bw/2:x}" y="${l.net>=0?y-4:y+11}" text-anchor="middle" font-size="8" fill="#23465b" font-weight="700">${format(l.net,1)}</text><text x="${x}" y="${height-17}" text-anchor="middle" font-size="7.5" fill="#496879">${l.name.split(/\s+/).slice(0,2).map((word,index)=>`<tspan x="${x}" dy="${index?9:0}">${escape(word.length>11?word.slice(0,10)+'…':word)}</tspan>`).join('')}</text>`;
 });
 return `<svg viewBox="0 0 ${width} ${height}" class="net-chart" role="img" aria-label="Ders net karşılaştırması">${svg}</svg>`;
}
function lessonCard(l) {const color=colors[l.index%6];return `<div class="subject-card" style="--subject:${color}"><span class="subject-icon">${icon(l.index,22)}</span><h3>${escape(l.name)}</h3><div class="subject-net">${format(l.net)}<small>${l.questionCount===null?' net':' / '+l.questionCount}</small></div><span class="rate-pill">${l.rate===null?(Number.isFinite(l.percent)?'Kaynak %'+format(l.percent,1):'Soru sayısı yok'):'%'+format(l.rate,1)}</span></div>`;}
function miniChart(l, baseline) {
 const color=colors[l.index%6], values=[l.net,l.previousNet].filter(Number.isFinite), max=Math.max(1,...values)*1.2, min=Math.min(0,...values)*1.2;
 const y=value=>12+(max-value)/(max-min)*43, zero=y(0);
 const column=(value,x,previous)=>{if(!Number.isFinite(value))return `<text x="${x+8}" y="44" text-anchor="middle" font-size="10" fill="#99acb8">—</text>`;const top=y(value);return `<rect x="${x}" y="${Math.min(top,zero)}" width="16" height="${Math.max(1,Math.abs(top-zero))}" rx="2" fill="${color}" opacity="${previous?'.35':'1'}"/><text x="${x+8}" y="${value<0?top+9:top-4}" text-anchor="middle" font-size="8" font-weight="700" fill="#35566c">${format(value,1)}</text>`;};
 return `<div class="mini-card" style="--subject:${color}"><strong>${icon(l.index,15)} ${escape(l.name)}</strong><svg class="mini-svg" viewBox="0 0 90 78" aria-label="${escape(l.name)} önceki ve seçili netler"><line x1="8" x2="82" y1="${zero}" y2="${zero}" stroke="#dae7ec"/>${column(l.previousNet,19,true)}${column(l.net,56,false)}<text x="27" y="74" text-anchor="middle" font-size="6.5" fill="#7a92a2">${baseline?'Önceki':'Kayıt yok'}</text><text x="64" y="74" text-anchor="middle" font-size="6.5" fill="#7a92a2">Seçili sınav</text></svg><span class="delta">${l.delta===null?'Önceki kayıt yok':(l.delta>0?'+':'')+format(l.delta)+' net'}</span></div>`;
}

function historyTable(rows,names,currentId){
 return `<section class="box exam-history"><h3>▤ SINAV GEÇMİŞİ</h3><table class="exam-history-table"><colgroup><col style="width:23%"><col style="width:7%"><col style="width:9%"><col style="width:7%">${names.map(()=>'<col>').join('')}</colgroup><thead><tr><th>TARİH / SINAV</th><th>ŞUBE</th><th>PUAN</th><th>NET</th>${names.map(name=>`<th>${escape(name)}<span>NET</span></th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr data-history-id="${r.id}" class="${r.id===currentId?'history-current':''}"><td><strong>${date(r.date)}</strong><span>${escape(r.title)}${r.id===currentId?' · Seçili sınav':''}</span></td><td>${escape(r.classroom)}</td><td>${format(r.score,3)}</td><td>${format(r.net)}</td>${names.map(name=>`<td>${format(r.lessons.find(l=>l.name===name)?.net)}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`;
}
function historyRowGroups(rows){
 const groups=[];let current=[],height=0;
 for(const r of rows){const estimate=21+Math.ceil(String(r.title??'').length/34)*10;if(current.length&&(current.length>=10||height+estimate>440)){groups.push(current);current=[];height=0;}current.push(r);height+=estimate;}
 if(current.length)groups.push(current);return groups;
}
function historyPage(data,logo,group,index,total){
 const {current,exam}=data;
 return `<article class="sheet history-page"><header class="report-header"><img src="${logo}" class="school-logo" alt="Kurum logosu"><div class="school-heading"><h1>${escape(current.institution)}</h1><div class="city">${escape(exam?.city??'')}</div><h2>Sınav Geçmişi</h2><p>Seçili sınava kadar kaydedilen sonuçlar</p></div></header><div class="ribbon"></div><section class="identity"><div class="student-data"><span>Öğrenci Adı Soyadı <b>${escape(current.name)}</b></span><span>Sınıf / Şube <b>${escape(current.classroom)}</b> <i>Okul No</i> <b>${escape(current.number??'—')}</b></span></div><div class="exam-meta"><b>${escape(current.title)}</b><span>${date(current.date)}</span></div></section>${historyTable(group.rows,group.names,current.id)}<p class="history-explanation">${group.subjectPageCount>1?`Ders grubu ${group.subjectPage+1} / ${group.subjectPageCount}. `:''}Eksik ders ve puanlar “—” ile gösterilir. Ham netler gösterilir; sınavların soru sayıları ve puan türleri farklı olabilir.</p><footer><span>Sınav Atlası · Öğrenci sınav geçmişi</span><span>Seçili sınav satırı vurgulanmıştır.</span><span>${index} / ${total}</span></footer><div class="footer-wave"></div></article>`;
}

function renderReport(snapshot, resultId, options={}) {
 const data=reportData(snapshot,resultId,options); const {current,exam,baseline,lessons}=data;
 const logo=options.logo && /^data:image\/(png|jpeg);base64,[a-zA-Z0-9+/=]+$/.test(options.logo) ? options.logo : 'data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'../renderer/assets/icon.png')).toString('base64');
 const pages=[];for(let i=0;i<lessons.length;i+=6)pages.push(lessons.slice(i,i+6));
 const inlineHistory=data.includeHistory&&data.history.length<=3&&data.historySubjects.length<=6&&data.history.reduce((height,r)=>height+21+Math.ceil(String(r.title??'').length/34)*10,0)<=120;
 const historyPages=[];
 if(data.includeHistory&&!inlineHistory){const rowGroups=historyRowGroups(data.history),subjectGroups=[];for(let i=0;i<data.historySubjects.length;i+=6)subjectGroups.push(data.historySubjects.slice(i,i+6));for(const [subjectPage,names]of subjectGroups.entries())for(const rows of rowGroups)historyPages.push({rows,names,subjectPage,subjectPageCount:subjectGroups.length});}
 const totalPageCount=pages.length+historyPages.length;
 const sheets=pages.map((chunk,pageIndex)=>{
 const totalBlank=chunk.every(l=>l.blank!==null)?chunk.reduce((s,l)=>s+l.blank,0):null;
 const allLessons=pages.length===1;
 const explanation=baseline?`${date(baseline.date)} tarihli sınavla ortak ${data.deltaLessons.length} derste toplam net farkı ${data.delta===null?'hesaplanamadı':(data.delta>0?'+':'')+format(data.delta)}. Ham netler karşılaştırılır; soru sayıları farklı olabilir.`:'Önceki sınav kaydı seçilmedi. İlk rapor, sonraki sınavlar için başlangıç noktasıdır.';
 return `<article class="sheet${inlineHistory?' has-inline-history':''}"><header class="report-header"><img src="${logo}" class="school-logo" alt="Kurum logosu"><div class="school-heading"><h1>${escape(current.institution)}</h1><div class="city">${escape(exam?.city??'')}</div><h2>Sınav Sonuç ve Gelişim Raporu</h2><p>Daha iyi bir gelecek, küçük adımlarla başlar.</p></div><div class="motto">Başarı<br>seninle<br><strong>mümkün.</strong><span>✧</span></div></header><div class="ribbon"></div>
 <section class="identity"><div class="student-avatar">${icon(3,30)}</div><div class="student-data"><span>Öğrenci Adı Soyadı <b>${escape(current.name)}</b></span><span>Sınıf / Şube <b>${escape(current.classroom)}</b> <i>Okul No</i> <b>${escape(current.number??'—')}</b></span></div><div class="exam-meta"><b>${escape(current.title)}</b><span>${date(current.date)}${exam?.district?' · '+escape(exam.district):''}</span></div></section>
 <section class="overview"><div class="overall"><div class="section-kicker">◎ GENEL BAŞARI DURUMU</div><span>Toplam Net</span><div class="total-net">${format(current.net)}${data.totalQuestions===null?'':`<small> / ${data.totalQuestions}</small>`}</div><div class="overall-rate">${data.rate===null?'Soru sayısı belirtilmedi':'Net / soru oranı: %'+format(data.rate,1)}</div><div class="lgs-score">${escape(exam?.metadata?.scoreLabel??'LGS')} Puanı <b>${format(current.score,3)}</b></div>${exam?.metadata?.sourceAverages?`<div class="source-score">Genel ort. ${format(exam.metadata.sourceAverages.general?.score,3)} · Okul ort. ${format(exam.metadata.sourceAverages.school?.score,3)}</div>`:''}</div><div class="subject-cards" style="--subjects:${chunk.length}">${chunk.map(lessonCard).join('')}</div></section>
 <section class="analysis-grid"><div class="box lesson-analysis"><h3>${icon(0,18)} DERS BAZINDA SONUÇ ANALİZİ</h3><table><thead><tr><th>Ders</th><th>Soru</th><th>D</th><th>Y</th><th>B</th><th>Net</th><th>Net/Soru</th></tr></thead><tbody>${chunk.map(l=>`<tr><td><span class="lesson-dot" style="background:${colors[l.index%6]}"></span>${escape(l.name)}</td><td>${format(l.questionCount,0)}</td><td>${format(l.correct,0)}</td><td>${format(l.wrong,0)}</td><td>${format(l.blank,0)}</td><td><b>${format(l.net)}</b></td><td><span class="table-rate" style="color:${colors[l.index%6]}">${l.rate===null?'—':'%'+format(l.rate,1)}</span></td></tr>`).join('')}<tr class="total-row"><td>${allLessons?'TOPLAM':'SAYFA TOPLAMI'}</td><td>${chunk.every(l=>l.questionCount!==null)?chunk.reduce((s,l)=>s+l.questionCount,0):'—'}</td><td>${chunk.reduce((s,l)=>s+l.correct,0)}</td><td>${chunk.reduce((s,l)=>s+l.wrong,0)}</td><td>${format(totalBlank,0)}</td><td>${format(chunk.reduce((s,l)=>s+l.net,0))}</td><td>${allLessons&&data.rate!==null?'%'+format(data.rate,1):'—'}</td></tr></tbody></table><p class="table-note">D: Doğru · Y: Yanlış · B: Boş. Belirtilmeyen bilgiler “—” ile gösterilir.</p></div>
 <div class="comparison"><div class="box"><h3>▥ NET KARŞILAŞTIRMA GRAFİĞİ</h3><div class="chart-legend"><span><i></i>${baseline?'Önceki sınav':'Önceki kayıt yok'}</span><span><i></i>Seçili sınav</span></div>${barChart(chunk,baseline)}</div><div class="progress-note"><b>${data.delta===null?'HER SINAV YENİ BİR BAŞLANGIÇ':data.delta>0?'ORTAK DERSLERDE NET ARTIŞI VAR':data.delta<0?'BİRLİKTE GELİŞİMİ PLANLAYALIM':'ORTAK DERSLERDE TOPLAM NET KORUNDU'}</b><p>${escape(explanation)}</p></div></div></section>
 <section class="box mini-section"><h3>${icon(1,18)} DERS DERS NET KARŞILAŞTIRMASI</h3><div class="mini-grid" style="--subjects:${chunk.length}">${chunk.map(l=>miniChart(l,baseline)).join('')}</div></section>
 ${inlineHistory?historyTable(data.history,data.historySubjects,current.id):''}
 <section class="notes-grid"><div class="note-box"><h3>✧ ÖNE ÇIKAN SONUÇLAR</h3><p>${escape(data.strengths)}</p></div><div class="note-box"><h3>◎ ÇALIŞMA ODAKLARI</h3><p>${escape(data.improvements)}</p></div><div class="note-box message-box"><h3>Sevgili Öğrencimiz,</h3><p>${escape(data.message)}</p><strong>Başarı seninle olsun!</strong></div></section>
 <footer><span>Sınav Atlası · Öğrenci gelişim raporu</span><span>${data.totalQuestions===null?'Soru sayısı bilinmediğinden genel yüzde hesaplanmadı.':'Yüzdeler net / soru sayısı üzerinden hesaplanır.'}</span><span>${pageIndex+1} / ${totalPageCount}</span></footer><div class="footer-wave"></div></article>`;
 }).join('');
 const historySheets=historyPages.map((group,i)=>historyPage(data,logo,group,pages.length+i+1,totalPageCount)).join('');
 const css=fs.readFileSync(path.join(__dirname,'../renderer/report.css'),'utf8');
 return {data,html:`<!doctype html><html lang="tr"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(current.name)} - Sınav Sonuç Raporu</title><style>${css}</style></head><body>${sheets}${historySheets}</body></html>`};
}
module.exports={reportData,renderReport};
