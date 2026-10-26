const {DatabaseSync}=require('node:sqlite');
const {randomUUID}=require('node:crypto');
const {validateStudent,validateMetadata,assertDate,studentPatch,examPatch,validateAverages}=require('./validation.cjs');
class Store{
 constructor(path){this.db=new DatabaseSync(path);this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS exams(id INTEGER PRIMARY KEY,date TEXT NOT NULL,title TEXT NOT NULL,institution TEXT NOT NULL,city TEXT,district TEXT,source TEXT,hash TEXT NOT NULL UNIQUE,metadata TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS students(id INTEGER PRIMARY KEY,number TEXT NOT NULL,name TEXT NOT NULL,institution TEXT NOT NULL,UNIQUE(institution,number));
 CREATE TABLE IF NOT EXISTS results(id INTEGER PRIMARY KEY,exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,student_id INTEGER NOT NULL REFERENCES students(id),classroom TEXT NOT NULL,correct REAL,wrong REAL,net REAL,score REAL,lessons TEXT NOT NULL,ranks TEXT NOT NULL,percentiles TEXT NOT NULL,source TEXT,UNIQUE(exam_id,student_id));
 CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 INSERT OR IGNORE INTO settings VALUES('threshold','350');`);
 const cols=this.db.prepare('PRAGMA table_info(results)').all();
 if(!cols.some(c=>c.name==='source'))this.db.exec(`BEGIN;CREATE TABLE results_v2(id INTEGER PRIMARY KEY,exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,student_id INTEGER NOT NULL REFERENCES students(id),classroom TEXT NOT NULL,correct REAL,wrong REAL,net REAL,score REAL,lessons TEXT NOT NULL,ranks TEXT NOT NULL,percentiles TEXT NOT NULL,source TEXT,UNIQUE(exam_id,student_id));INSERT INTO results_v2(id,exam_id,student_id,classroom,correct,wrong,net,score,lessons,ranks,percentiles) SELECT id,exam_id,student_id,classroom,correct,wrong,net,score,lessons,ranks,percentiles FROM results;DROP TABLE results;ALTER TABLE results_v2 RENAME TO results;COMMIT;`);
 this.db.exec(`CREATE INDEX IF NOT EXISTS results_student ON results(student_id);CREATE INDEX IF NOT EXISTS exams_date ON exams(date);
 CREATE TABLE IF NOT EXISTS subjects(id INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE);
 CREATE TABLE IF NOT EXISTS exam_subjects(exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE,subject_id INTEGER REFERENCES subjects(id),position INTEGER,question_count INTEGER,PRIMARY KEY(exam_id,subject_id));
 CREATE TABLE IF NOT EXISTS subject_results(result_id INTEGER REFERENCES results(id) ON DELETE CASCADE,subject_id INTEGER REFERENCES subjects(id),correct REAL,wrong REAL,blank REAL,net REAL,PRIMARY KEY(result_id,subject_id));
 CREATE TABLE IF NOT EXISTS exam_averages(exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,scope TEXT NOT NULL,subject TEXT NOT NULL DEFAULT '',correct REAL,wrong REAL,net REAL,score REAL,PRIMARY KEY(exam_id,scope,subject));
 CREATE TABLE IF NOT EXISTS imports(id INTEGER PRIMARY KEY,exam_id INTEGER REFERENCES exams(id) ON DELETE SET NULL,source TEXT NOT NULL,hash TEXT NOT NULL,fingerprint TEXT,status TEXT NOT NULL,report TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
 // Backfill normalized lesson rows for databases created by version 1.
 if(this.db.prepare('PRAGMA user_version').get().user_version<2){this.db.exec('BEGIN');try{for(const r of this.db.prepare('SELECT id,exam_id,lessons FROM results').all())this.lessons(r.exam_id,r.id,JSON.parse(r.lessons));this.db.exec('PRAGMA user_version=2;COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
 if(this.db.prepare('PRAGMA user_version').get().user_version<3){this.db.exec('BEGIN');try{for(const exam of this.db.prepare('SELECT id,metadata FROM exams').all()){const meta=JSON.parse(exam.metadata),first=this.db.prepare('SELECT lessons FROM results WHERE exam_id=? ORDER BY id LIMIT 1').get(exam.id),names=first?JSON.parse(first.lessons).map(l=>l.name):[];const averages=this.sourceAverages(meta,names);this.averages(exam.id,averages);meta.sourceAverages=averages;meta.subjects=names;this.db.prepare('UPDATE exams SET metadata=? WHERE id=?').run(JSON.stringify(meta),exam.id);}this.db.exec('PRAGMA user_version=3;COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
 const studentCols=this.db.prepare('PRAGMA table_info(students)').all();
 if(!studentCols.some(c=>c.name==='display_number'))this.db.exec("BEGIN;ALTER TABLE students ADD COLUMN display_number TEXT;UPDATE students SET display_number=CASE WHEN number LIKE '~missing:%' OR number='0' THEN NULL ELSE number END;COMMIT;");
 if(!this.db.prepare('PRAGMA table_info(results)').all().some(c=>c.name==='booklet'))this.db.exec('ALTER TABLE results ADD COLUMN booklet TEXT;');
 this.db.exec('CREATE TABLE IF NOT EXISTS manual_edits(id INTEGER PRIMARY KEY,entity TEXT NOT NULL,entity_id INTEGER NOT NULL,before_json TEXT NOT NULL,after_json TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);PRAGMA user_version=4;');
 }
 lessons(examId,resultId,lessons){lessons.forEach((lesson,index)=>{this.db.prepare('INSERT OR IGNORE INTO subjects(name) VALUES(?)').run(lesson.name);const subject=this.db.prepare('SELECT id FROM subjects WHERE name=?').get(lesson.name);this.db.prepare('INSERT OR IGNORE INTO exam_subjects(exam_id,subject_id,position) VALUES(?,?,?)').run(examId,subject.id,index);this.db.prepare('INSERT OR REPLACE INTO subject_results VALUES(?,?,?,?,?,?)').run(resultId,subject.id,lesson.correct,lesson.wrong,lesson.blank??null,lesson.net);});}
 averages(examId,averages){for(const scope of ['general','school']){const a=averages?.[scope];if(!a)continue;this.db.prepare('INSERT OR REPLACE INTO exam_averages VALUES(?,?,?,?,?,?,?)').run(examId,scope,'',a.correct??null,a.wrong??null,a.net??null,a.score??null);for(const l of a.lessons??[])this.db.prepare('INSERT OR REPLACE INTO exam_averages VALUES(?,?,?,?,?,?,?)').run(examId,scope,l.name,l.correct??null,l.wrong??null,l.net??null,null);}}
 sourceAverages(meta,names){if(meta.sourceAverages)return meta.sourceAverages;const result={};for(const scope of ['general','school']){const values=meta.averages?.[scope];if(Array.isArray(values)&&values.length===names.length*3+4)result[scope]={lessons:names.map((name,i)=>({name,correct:values[i*3],wrong:values[i*3+1],net:values[i*3+2]})),correct:values.at(-4),wrong:values.at(-3),net:values.at(-2),score:values.at(-1)};}return result;}
 import(parsed,date,source){
 assertDate(date);
 if(parsed.issues?.length||!parsed.students.length)throw new Error('İnceleme gerektiren kayıtlar düzeltilmeden aktarım yapılamaz.');
 const metadataErrors=validateMetadata(parsed.metadata);if(metadataErrors.length)throw new Error(metadataErrors.join('\n'));validateAverages(parsed.sourceAverages,parsed.students[0].lessons.map(l=>l.name));
 if(this.db.prepare('SELECT id FROM exams WHERE hash=?').get(parsed.hash))throw new Error('Bu PDF daha önce aktarıldı. Aynı dosya ikinci kez eklenemez.');
 this.db.exec('BEGIN IMMEDIATE');try{const m=parsed.metadata;const e=this.db.prepare('INSERT INTO exams(date,title,institution,city,district,source,hash,metadata) VALUES(?,?,?,?,?,?,?,?)').run(date,m.title,m.institution,m.city??'',m.district??'',source,parsed.hash,JSON.stringify({...m,averages:parsed.averages,sourceAverages:parsed.sourceAverages,subjects:parsed.students[0].lessons.map(l=>l.name)}));
 for(const original of parsed.students){const s=studentPatch(original,original),errors=validateStudent(s,m.penalty??3);if(errors.length)throw new Error(errors.join('\n'));const student=this.ensureStudent(s,m.institution);const r=this.db.prepare('INSERT INTO results(exam_id,student_id,classroom,correct,wrong,net,score,lessons,ranks,percentiles,source,booklet) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(e.lastInsertRowid,student.id,s.classroom,s.correct,s.wrong,s.net,s.score??null,JSON.stringify(s.lessons),JSON.stringify(s.rank),JSON.stringify(s.percentile),JSON.stringify(s.source??null),s.booklet??null);this.lessons(e.lastInsertRowid,r.lastInsertRowid,s.lessons);}
 this.averages(e.lastInsertRowid,parsed.sourceAverages);
 this.db.prepare('INSERT INTO imports(exam_id,source,hash,fingerprint,status,report) VALUES(?,?,?,?,?,?)').run(e.lastInsertRowid,source,parsed.hash,null,'imported',JSON.stringify({analysis:parsed.analysis,warnings:parsed.warnings,issues:parsed.issues??[],edits:parsed.edits??[]}));this.db.exec('COMMIT');return Number(e.lastInsertRowid);
 }catch(error){this.db.exec('ROLLBACK');throw error;}}
 snapshot(){return {exams:this.db.prepare('SELECT * FROM exams ORDER BY date DESC,id DESC').all().map(e=>({...e,metadata:JSON.parse(e.metadata)})),rows:this.db.prepare('SELECT r.*,s.name,s.display_number AS number,s.institution,e.date,e.title FROM results r JOIN students s ON s.id=r.student_id JOIN exams e ON e.id=r.exam_id ORDER BY e.date DESC,r.score DESC').all().map(r=>({...r,lessons:JSON.parse(r.lessons),rank:JSON.parse(r.ranks),percentile:JSON.parse(r.percentiles),source:JSON.parse(r.source??'null')})),threshold:Number(this.db.prepare("SELECT value FROM settings WHERE key='threshold'").get().value),imports:this.db.prepare('SELECT id,exam_id,source,status,created_at,report FROM imports ORDER BY id DESC LIMIT 100').all().map(i=>({...i,report:JSON.parse(i.report)}))};}

 ensureStudent(s,institution){const key=s.number||'~missing:'+randomUUID();this.db.prepare('INSERT INTO students(number,display_number,name,institution) VALUES(?,?,?,?) ON CONFLICT(institution,number) DO UPDATE SET name=excluded.name').run(key,s.number??null,s.name,institution);return this.db.prepare('SELECT * FROM students WHERE institution=? AND number=?').get(institution,key);}
 audit(entity,id,before,after){this.db.prepare('INSERT INTO manual_edits(entity,entity_id,before_json,after_json) VALUES(?,?,?,?)').run(entity,id,JSON.stringify(before),JSON.stringify(after));}
 updateResult(id,input,{linkExisting=false}={}){
 const snapshot=this.snapshot(),before=snapshot.rows.find(r=>r.id===id);if(!before)throw new Error('Sonuç bulunamadı.');
 const exam=snapshot.exams.find(e=>e.id===before.exam_id),s=studentPatch(before,input),errors=validateStudent(s,exam.metadata.penalty??3);if(errors.length)throw new Error(errors.join('\n'));
 const target=s.number?this.db.prepare('SELECT * FROM students WHERE institution=? AND number=?').get(before.institution,s.number):null;
 if(target&&target.id!==before.student_id&&!linkExisting)throw new Error('Bu numarada kayıtlı bir öğrenci var. Eşleştirme seçeneğini açıkça işaretleyin.');
 if(target&&target.id!==before.student_id&&this.db.prepare('SELECT id FROM results WHERE exam_id=? AND student_id=?').get(before.exam_id,target.id))throw new Error('Bu öğrencinin aynı sınavda zaten sonucu var. Kayıtlar birleştirilmedi.');
 this.db.exec('BEGIN IMMEDIATE');try{
  const studentId=target?.id??before.student_id;
  if(studentId===before.student_id)this.db.prepare('UPDATE students SET number=?,display_number=?,name=? WHERE id=?').run(s.number||'~missing:'+randomUUID(),s.number,s.name,studentId);
  else if(s.name!==target.name)throw new Error('Eşleştirilecek öğrencinin adı kayıtlı adla aynı olmalıdır: '+target.name);
  this.db.prepare('UPDATE results SET student_id=?,classroom=?,correct=?,wrong=?,net=?,score=?,lessons=?,ranks=?,percentiles=?,booklet=? WHERE id=?').run(studentId,s.classroom,s.correct,s.wrong,s.net,s.score??null,JSON.stringify(s.lessons),JSON.stringify(s.rank),JSON.stringify(s.percentile),s.booklet??null,id);
  this.lessons(before.exam_id,id,s.lessons);this.audit('result',id,before,{...s,student_id:studentId});this.db.exec('COMMIT');return id;
 }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 updateExam(id,input){
 const snapshot=this.snapshot(),before=snapshot.exams.find(e=>e.id===id);if(!before)throw new Error('Sınav bulunamadı.');
 const m=examPatch({...before.metadata,title:before.title,institution:before.institution,city:before.city,district:before.district},input),date=input.date??before.date;assertDate(date);
 const averages=input.sourceAverages??before.metadata.sourceAverages??{};validateAverages(averages,m.subjects);
 const rows=snapshot.rows.filter(r=>r.exam_id===id);for(const r of rows){const errors=validateStudent(r,m.penalty??3);if(errors.length)throw new Error(errors.join('\n'));}
 if(m.participation[3]!=null&&m.participation[3]!==rows.length)throw new Error('Kurum katılımı kayıt sayısıyla eşleşmelidir.');
 this.db.exec('BEGIN IMMEDIATE');try{
  if(m.institution!==before.institution)for(const r of rows){const student=this.ensureStudent(r,m.institution);this.db.prepare('UPDATE results SET student_id=? WHERE id=?').run(student.id,r.id);}
  m.sourceAverages=averages;this.db.prepare('UPDATE exams SET date=?,title=?,institution=?,city=?,district=?,metadata=? WHERE id=?').run(date,m.title,m.institution,m.city,m.district,JSON.stringify(m),id);
  this.db.prepare('DELETE FROM exam_averages WHERE exam_id=?').run(id);this.averages(id,averages);this.audit('exam',id,before,{date,...m});this.db.exec('COMMIT');return id;
 }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 setThreshold(v){if(!Number.isFinite(v)||v<0||v>500)throw new Error('Başarı eşiği 0–500 arasında olmalıdır.');this.db.prepare("UPDATE settings SET value=? WHERE key='threshold'").run(String(v));}
 deleteExam(id){if(!Number.isInteger(id))throw new Error('Geçersiz sınav.');this.db.prepare('DELETE FROM exams WHERE id=?').run(id);}
 backup(path){this.db.prepare('VACUUM INTO ?').run(path);}
 close(){this.db.close();}
}
module.exports={Store};
