import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const worker=resolve('scripts/publish_from_supabase.mjs');
for(const language of ['es','en','both'])test(`publication only writes and links available language: ${language}`,()=>{
 const dir=mkdtempSync(join(tmpdir(),'glossa-language-'));
 try{
  const row={slug:'fixture-article',issue_no:'N° 60',issue_id:'issue',body_es:language==='en'?'':'Spanish article',body_en:language==='es'?'':'English article'};
  const preload=join(dir,'mock.mjs');
  writeFileSync(preload,`globalThis.fetch=async (url,options={})=>{if(!options.method)return Response.json([${JSON.stringify(row)}]);console.log('PATCH '+options.body);return Response.json([{}]);};`);
  const call=cmd=>spawnSync(process.execPath,['--import',preload,worker,cmd,'00000000-0000-4000-8000-000000000001','test-sha'],{cwd:dir,encoding:'utf8',env:{SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_KEY:'fake-test-key'}});
  const prepared=call('prepare');assert.equal(prepared.status,0,prepared.stderr);
  for(const l of ['es','en']){const file=join(dir,'src/content/articles/fixture-article',l+'.mdx');assert.equal(existsSync(file),Boolean(row['body_'+l]));if(existsSync(file))assert.equal(readFileSync(file,'utf8'),row['body_'+l]);}
  const done=call('finalize');assert.equal(done.status,0,done.stderr);
  const patches=done.stdout.split('\n').filter(x=>x.startsWith('PATCH ')).map(x=>JSON.parse(x.slice(6)));
  assert.equal(patches.length,2);
  for(const patch of patches)for(const l of ['es','en'])assert.equal(patch['url_'+l],row['body_'+l]?`https://glossa.ademas.ai/articles/fixture-article/${l}/`:null);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
