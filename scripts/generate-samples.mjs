// Deterministic synthetic sample-data generator for Exam Atlas.
// Produces two text-layer PDFs with FICTIONAL students (no real personal data).
// The layout mirrors the parser's coordinate system (A4 landscape, Courier font).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'samples');

// ---------- deterministic PRNG (mulberry32) ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const round2 = v => Number(v.toFixed(2));
const round3 = v => Number(v.toFixed(3));

// ---------- layout constants (scaled coordinates; scale == 1.0 for 841.89-wide page) ----------
const PAGE_W = 841.89, PAGE_H = 595.28;
const FONT_SIZE = 6;
const CW = 0.6 * FONT_SIZE; // Courier advance width per glyph (points)

const LABEL_Y = 530.5, VALUE_Y = 499.6, SUBJECT_Y = 477.1, HEADER_Y = 460.1;
const AVG_GENEL_Y = 443.1, AVG_OKUL_Y = 426.1;
const FIRST_DATA_Y = 409.1, ROW_DY = 22.7, RANK_DY = 4.2, PCT_DY = -2.6;

// 22 numeric column centers: 6 subjects x (D,Y,N) + Toplam(D,Y,N) + Puan
const CENTERS = [
  154.45, 180.0, 205.5,    // TÜRKÇE
  231.05, 256.6, 281.5,    // SOSYAL / İNKILAP
  307.55, 333.1, 358.0,    // DİN KÜLTÜRÜ
  384.05, 409.6, 434.5,    // İNGİLİZCE
  460.65, 486.2, 511.1,    // MATEMATİK
  537.15, 562.7, 587.6,    // FEN BİLİMLERİ
  613.75, 639.2, 663.9,    // TOPLAM
  702.95                   // PUAN (LGS)
];
const RANK_CENTERS = [741.25, 766.75, 792.2, 817.75];
const SUBJECT_CENTERS = [180.0, 256.6, 333.1, 409.6, 486.2, 562.7]; // mid of each D/Y/N group

const fakeNames = Array.from({length:15},(_,i)=>'DEMO '+String(i+1).padStart(2,'0')); // Labels, not real people.

// ---------- minimal PDF writer (Courier standard font, ASCII text) ----------
const esc = s => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
const num = x => String(Number(x.toFixed(4)));

function buildPdf(items) {
  let stream = 'BT\n';
  for (const it of items) {
    const size = it.size ?? FONT_SIZE;
    stream += `/F1 ${size} Tf\n1 0 0 1 ${num(it.x)} ${num(it.y)} Tm (${esc(it.text)}) Tj\n`;
  }
  stream += 'ET';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(PAGE_W)} ${num(PAGE_H)}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objs.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'ascii');
}

// place text CENTERED at centerX on baseline y
const center = (text, centerX, y, size) => ({ text, x: centerX - 0.6 * (size ?? FONT_SIZE) * text.length / 2, y, size });
// place text LEFT-aligned at x
const left = (text, x, y, size) => ({ text, x, y, size });

// ---------- data generation ----------
function makeStudents(count, grade, rng, nullRanks) {
  const students = [];
  for (let i = 0; i < count; i++) {
    const number = String(1001 + i);
    const name = fakeNames[i % fakeNames.length];
    const classroom = grade + ' / ' + 'ABCDEFGH'[i % 8];
    const lessons = [];
    for (let s = 0; s < 6; s++) {
      const correct = 3 + Math.floor(rng() * 15); // 3..17
      const wrong = Math.floor(rng() * 6);        // 0..5
      lessons.push({ correct, wrong, net: round2(correct - wrong / 3) });
    }
    const totalCorrect = lessons.reduce((a, l) => a + l.correct, 0);
    const totalWrong = lessons.reduce((a, l) => a + l.wrong, 0);
    const totalNet = round2(lessons.reduce((a, l) => a + l.net, 0));
    const score = round3(480 - i * 9.5 + rng() * 5);
    let rank, percentile;
    if (nullRanks) {
      rank = [null, 1, 1, 1 + (i % 3)];
      percentile = [0, round2(rng() * 2), round2(rng() * 2), round2(rng() * 2)];
    } else {
      rank = [150 + i * 11, 1, 1, 1 + (i % 3)];
      percentile = [round2(0.3 + i * 0.15), round2(rng() * 2), round2(rng() * 2), round2(rng() * 2)];
    }
    students.push({ number, name, classroom, lessons, totalCorrect, totalWrong, totalNet, score, rank, percentile });
  }
  return students;
}

function averages(students) {
  const n = students.length;
  const mean = f => students.reduce((a, s) => a + f(s), 0) / n;
  const lessons = [];
  for (let si = 0; si < 6; si++) {
    lessons.push({
      correct: round2(mean(s => s.lessons[si].correct)),
      wrong: round2(mean(s => s.lessons[si].wrong)),
      net: round2(mean(s => s.lessons[si].net))
    });
  }
  return {
    lessons,
    correct: round2(mean(s => s.totalCorrect)),
    wrong: round2(mean(s => s.totalWrong)),
    net: round2(mean(s => s.totalNet)),
    score: round3(mean(s => s.score))
  };
}

function emitHeader(items, cfg) {
  items.push(left('IL', 64.1, LABEL_Y));
  items.push(left('ILCE', 166.2, LABEL_Y));
  items.push(left('KURUM', 338.5, LABEL_Y));
  items.push(left('SINAV-ADI', 582.6, LABEL_Y));
  // metadata values
  items.push(center('DEMO CITY', 68.3, VALUE_Y));
  items.push(center('DEMO DISTRICT', 174.6, VALUE_Y));
  items.push(center('DEMO SCHOOL', 349.0, VALUE_Y));
  items.push(center(cfg.title, 601.5, VALUE_Y));
  // participation values under rank columns
  const part = cfg.participation; // array of 4 strings
  for (let k = 0; k < 4; k++) items.push(center(part[k], RANK_CENTERS[k], VALUE_Y));
  // subject names + Toplam + LGS + rank labels
  cfg.subjects.forEach((subj, i) => items.push(center(subj, SUBJECT_CENTERS[i], SUBJECT_Y)));
  items.push(center('Toplam', 639.2, SUBJECT_Y));
  items.push(center('LGS', 702.95, SUBJECT_Y));
  items.push(center('Genel', RANK_CENTERS[0], SUBJECT_Y));
  items.push(center('Il', RANK_CENTERS[1], SUBJECT_Y));
  items.push(center('Ilce', RANK_CENTERS[2], SUBJECT_Y));
  items.push(center('Kurum', RANK_CENTERS[3], SUBJECT_Y));
  // D/Y/N headers + Puan
  for (let i = 0; i < 7; i++) {
    const base = i * 3;
    items.push(center('D', CENTERS[base], HEADER_Y));
    items.push(center('Y', CENTERS[base + 1], HEADER_Y));
    items.push(center('N', CENTERS[base + 2], HEADER_Y));
  }
  items.push(center('Puan', 702.95, HEADER_Y));
}

function schoolAverages(g) {
  return {
    lessons: g.lessons.map(l => ({ correct: round2(l.correct * 1.04), wrong: round2(l.wrong * 0.92), net: round2(l.net * 1.05) })),
    correct: round2(g.correct * 1.04),
    wrong: round2(g.wrong * 0.92),
    net: round2(g.net * 1.05),
    score: round3(g.score * 1.03)
  };
}

function emitAverages(items, y, label, avg) {
  items.push(left(label, 54.8, y));
  const cells = [];
  for (let si = 0; si < 6; si++) cells.push(avg.lessons[si].correct, avg.lessons[si].wrong, avg.lessons[si].net);
  cells.push(avg.correct, avg.wrong, avg.net, avg.score);
  cells.forEach((v, i) => items.push(center(String(v), CENTERS[i], y)));
}

function emitStudent(items, s, dataY) {
  const ordinal = String(s.index + 1);
  items.push(left(ordinal, 17.0, dataY));
  items.push(left(s.number + ' - ' + s.name, 26.3, dataY));
  items.push(left(s.classroom, 122.9, dataY));
  const cells = [];
  for (const l of s.lessons) cells.push(l.correct, l.wrong, l.net);
  cells.push(s.totalCorrect, s.totalWrong, s.totalNet, s.score);
  cells.forEach((v, i) => items.push(center(String(v), CENTERS[i], dataY)));
  // ranks + percentiles
  for (let k = 0; k < 4; k++) {
    const rv = s.rank[k] === null ? '-' : String(s.rank[k]);
    items.push(center(rv, RANK_CENTERS[k], dataY + RANK_DY));
    items.push(center('%' + s.percentile[k], RANK_CENTERS[k], dataY + PCT_DY));
  }
}

function generate(cfg) {
  const rng = mulberry32(cfg.seed);
  const students = makeStudents(cfg.count, cfg.grade, rng, cfg.nullRanks).map((s, idx) => ({ ...s, index: idx }));
  const items = [];
  emitHeader(items, cfg);
  emitAverages(items, AVG_GENEL_Y, 'Genel-Ortalama', averages(students));
  emitAverages(items, AVG_OKUL_Y, 'Okul-Ortalamasi', schoolAverages(averages(students)));
  students.forEach((s, i) => emitStudent(items, s, FIRST_DATA_Y - i * ROW_DY));
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, cfg.file);
  fs.writeFileSync(file, buildPdf(items));
  console.log('wrote', file, '(' + items.length + ' text items)');
}

generate({
  file: 'demo-grade-6.pdf',
  seed: 1,
  grade: '6',
  count: 15,
  nullRanks: false,
  subjects: ['TURKCE', 'SOSYAL-BILGILER', 'DIN-KULTURU', 'INGILIZCE', 'MATEMATIK', 'FEN-BILIMLERI'],
  title: '6.SINIF DENEME SINAVI-1',
  participation: ['40000', '900', '600', '15']
});

generate({
  file: 'demo-grade-8.pdf',
  seed: 2,
  grade: '8',
  count: 15,
  nullRanks: true,
  subjects: ['TURKCE', 'INKILAP-TARIHI', 'DIN-KULTURU', 'INGILIZCE', 'MATEMATIK', 'FEN-BILIMLERI'],
  title: '8.SINIF DENEME SINAVI-1',
  participation: ['-', '-', '-', '-']
});

// A separate worksheet layout: no wrong-answer penalty, missing identity fields.
function generateWorksheet(){
 const items=[],count=8;
 for(const [text,x,y]of [['Il',17,567.37],[': DEMO CITY',59.53,567.37],['Okul',121.89,567.37],[': DEMO SCHOOL',164.41,567.37],['Ilce',17,556.03],[': DEMO DISTRICT',59.53,556.03],['Sinav',121.89,556.03],[': DEMO WORKSHEET',164.41,556.03],['Katilim Bilgileri',716.23,573.04],['Okul',670.67,561.7],[String(count),674.45,550.36],['Puan Listesi',399.16,533.35],['Sr',18.26,511.28],['Sinif',30.68,511.28],['No',52.86,511.28],['Adi Soyadi',70.87,511.28],['KT',167.66,511.28]])items.push(left(text,x,y));
 const xs=[187.496,205.311,223.126,240.941,258.766,276.581,294.396,312.211,330.036,347.851,365.666,383.481,401.306,419.121,436.936,454.751,472.576,490.391,508.206,526.021,543.846,561.661,579.476,597.291,618.086,641.841,665.606,752.595];
 const names=['TURKCE','SOSYAL','DIN','INGILIZCE','MATEMATIK','FEN'];
 names.forEach((name,i)=>items.push(center(name,xs[i*4]+26.7,516.94)));
 items.push(center('Toplam',641.84,516.94),center('TFDMIS',752.59,516.94));
 xs.forEach((x,i)=>items.push(center(i<24?['D','Y','N','P'][i%4]:['D','Y','N','Puan'][i-24],x,505.61)));
 for(let i=0;i<count;i++){
  const y=494.27-i*11.34,values=[];let totalCorrect=0,totalWrong=0;
  for(let j=0;j<6;j++){const c=2+(i+j)%8,w=10-c;values.push(c,w,c,c*10);totalCorrect+=c;totalWrong+=w;}
  values.push(totalCorrect,totalWrong,totalCorrect,200+totalCorrect*3);
  items.push(left(String(i+1),17.92,y),center('7A',36.85,y),center(i>=4?'0':String(2001+i),56.69,y),left('A',169.5,y));
  if(i!==5)items.push(left('DEMO '+String(i+1).padStart(2,'0'),70.87,y));
  values.forEach((v,k)=>items.push(center(String(v),xs[k],y)));
 }
 items.push(left('FICTIONAL DEMO DATA ONLY - no real student records',17,25.95));
 fs.writeFileSync(path.join(outDir,'demo-worksheet-7.pdf'),buildPdf(items));
 console.log('wrote synthetic worksheet sample');
}
generateWorksheet();
