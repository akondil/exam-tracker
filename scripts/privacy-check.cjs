// Allowlist-based distribution check. This is a safeguard, not a PII classifier.
const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const allowed=new Set([
 'package.json','package-lock.json','README.md','LICENSE','PRIVACY.md','SECURITY.md','CONTRIBUTING.md','PUBLISHING.md','.gitignore','.gitattributes',
 'src/batch-report.cjs','src/main.cjs','src/preload.cjs','src/pdf.mjs','src/database.cjs','src/validation.cjs','src/report.cjs','src/report-service.cjs',
 'renderer/index.html','renderer/app.js','renderer/edit-ui.js','renderer/report-ui.js','renderer/styles.css','renderer/report.css','renderer/assets/icon.png',
 'build/icon.png','build/icon.ico','scripts/generate-samples.mjs','scripts/windows-deps.cjs','scripts/privacy-check.cjs','scripts/public-smoke.cjs','test/batch-report.test.mjs','scripts/batch-report-smoke.cjs','test/report-history.test.mjs','scripts/report-history-smoke.cjs','test/public.test.mjs',
 'samples/demo-grade-6.pdf','samples/demo-grade-8.pdf','samples/demo-worksheet-7.pdf',
 '.github/workflows/ci.yml','.github/workflows/release.yml','.github/ISSUE_TEMPLATE/bug_report.md'
]);
const excluded=new Set(['node_modules','dist','.git','coverage']);
async function check(){
 const errors=[],found=new Set();
 async function walk(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){
  if(dir===root&&excluded.has(entry.name))continue;
  const full=path.join(dir,entry.name),rel=path.relative(root,full).split(path.sep).join('/');
  if(entry.isSymbolicLink()){errors.push('Symlink is not allowed: '+rel);continue;}
  if(entry.isDirectory()){await walk(full);continue;}
  found.add(rel);if(!allowed.has(rel))errors.push('File is not in the public distribution allowlist: '+rel);
  if(/\.(?:cjs|mjs|js|json|md|yml)$/.test(rel)){
   const text=await fs.readFile(full,'utf8');
   if(/\/(?:home|Users)\/[^/\s]+\//.test(text))errors.push('Absolute user path: '+rel);
   if(/(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}|-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY-----/.test(text))errors.push('Possible credential: '+rel);
  }
 }}
 await walk(root);for(const rel of allowed)if(!found.has(rel))errors.push('Required public file missing: '+rel);
 const {parsePdf}=await import('../src/pdf.mjs');
 for(const name of ['demo-grade-6.pdf','demo-grade-8.pdf','demo-worksheet-7.pdf']){
  const p=await parsePdf(path.join(root,'samples',name),{strict:false});
  if(p.metadata.institution!=='DEMO SCHOOL'||!p.students.length||p.students.some(s=>s.name&&!/^DEMO \d{2}$/.test(s.name)))errors.push('Unexpected identity data in sample: '+name);
  if(p.issues.some(i=>!(name==='demo-worksheet-7.pdf'&&i.index===5&&i.message==='Öğrenci adı zorunludur.')))errors.push('Unexpected sample parsing issue: '+name);
 }
 if(errors.length)throw new Error(errors.join('\n'));
 console.log('Public distribution check passed: allowlisted source files and synthetic demo identities only.');
}
if(require.main===module)check().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={check};
