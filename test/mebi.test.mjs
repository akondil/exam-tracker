import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {analyzeDocument} from '../src/pdf.mjs';
const require=createRequire(import.meta.url),{Store}=require('../src/database.cjs'),{examPatch,revalidateParsed}=require('../src/validation.cjs');
// Fictional coordinate fixture: variable-width Excel columns, right-aligned values,
// no repeated headers on continuation pages. No private PDF or student data.
function document(){
 const item=(text,x,y,w=String(text).length*1.4)=>({text:String(text),x,y,w});
 const labels=['Türkçe','İnkılap','Din','İngilizce','Matematik','Fen Bilimleri'],headers=[item('Sınıf',10,550),item('Şube',30,550),item('Ad Soyad',95,550),item('Okul No',140,550)];let x=165;
 for(const subject of labels)for(const metric of ['Doğru','Yanlış','Boş','Net']){const h=item(subject+' '+metric,x,550);headers.push(h);x+=Math.max(25,h.w+5);}
 headers.push(item('Toplam Net',x,550),item('puan',x+30,550));
 function student(y,index){const cells=[item('8',12,y),item('8. Sınıf / A Şubesi',30,y),item('DEMO '+String(index).padStart(2,'0'),65,y),item(String(9000+index),145,y)];let indexColumn=4;
 for(let i=0;i<6;i++)for(const v of [i===0?'0':'8',i===0?'3':'1',i===0?'17':'1',i===0?'-1':'7,667']){const h=headers[indexColumn++];cells.push(item(v,h.x+h.w-String(v).length*1.4,y));}
 for(const v of ['37,335','321,123']){const h=headers[indexColumn++];cells.push(item(v,h.x+h.w-String(v).length*1.4,y));}return cells;}
 return {hash:'synthetic-mebi',pages:[{number:1,items:[item('DEMO MEBİ LGS',10,565),...headers,...student(540,1)]},{number:2,items:student(560,2)}]};
}
function complete(p){p.metadata=examPatch(p.metadata,{institution:'DEMO SCHOOL',city:'DEMO CITY',district:'DEMO DISTRICT'});return revalidateParsed(p);}
test('Combined headers and headerless pages preserve all metrics and require the real institution',()=>{
 const p=analyzeDocument(document());assert.equal(p.metadata.format,'mebi');assert.equal(p.students.length,2);assert.equal(p.metadata.institution,'');assert.equal(p.issues.length,1);assert.match(p.issues[0].message,/kurum/);assert.deepEqual(p.metadata.participation,[null,null,null,null]);assert.deepEqual(p.sourceAverages,{});
 for(const s of p.students){assert.equal(s.classroom,'8/A');assert.equal(s.lessons[1].name,'İnkılap Tarihi');assert.equal(s.lessons[2].name,'Din Kültürü');assert.deepEqual(s.lessons[0],{name:'Türkçe',correct:0,wrong:3,blank:17,net:-1});assert.equal(s.correct,40);assert.equal(s.wrong,8);assert.equal(s.net,37.335);assert.equal(s.score,321.123);assert.deepEqual(s.rank,[null,null,null,null]);}
 assert.deepEqual(complete(p).issues,[]);
});
test('Unknown institution blocks writes; completed metadata persists normalized results and report history',()=>{
 const p=analyzeDocument(document()),db=new Store(':memory:');try{assert.throws(()=>db.import(p,'2026-11-05','demo-mebi.pdf'));assert.equal(db.snapshot().rows.length,0);db.import(complete(p),'2026-11-05','demo-mebi.pdf');const snapshot=db.snapshot();assert.equal(snapshot.rows.length,2);assert.equal(db.db.prepare('SELECT count(*) n FROM subject_results').get().n,12);assert.equal(snapshot.exams[0].metadata.format,'mebi');assert.equal(snapshot.rows[0].lessons[0].blank,17);assert.equal(db.db.prepare('SELECT count(*) n FROM exam_averages').get().n,0);assert.deepEqual(db.db.prepare('PRAGMA foreign_key_check').all(),[]);}finally{db.close();}
});
test('Missing numeric cells stay editable, invalid totals and missing row identity block import',()=>{
 for(const mutate of [d=>d.pages[1].items.splice(4,1),d=>{d.pages[1].items.at(-2).text='40';},d=>d.pages[1].items.shift(),d=>{d.pages[1].items[3].text='9001';}]){const d=document();mutate(d);const p=complete(analyzeDocument(d));assert.ok(p.issues.length);const db=new Store(':memory:');try{assert.throws(()=>db.import(p,'2026-11-05','bad.pdf'));assert.equal(db.snapshot().rows.length,0);}finally{db.close();}}
});
test('Repeated page headers are re-read; mixed exams and missing subjects are rejected',()=>{
 const d=document();d.pages[1].items.forEach(i=>i.y-=25);d.pages[1].items.push(...structuredClone(d.pages[0].items.filter(i=>i.y>=550)));assert.deepEqual(complete(analyzeDocument(d)).issues,[]);
 d.pages[1].items.find(i=>i.text==='DEMO MEBİ LGS').text='DEMO OTHER EXAM';assert.ok(complete(analyzeDocument(d)).issues.length);
 const bad=document();bad.pages[0].items=bad.pages[0].items.filter(i=>i.text!=='Türkçe Yanlış');assert.ok(analyzeDocument(bad).issues.length);
});
