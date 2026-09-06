import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

function finalize(issueResponse, cmd = 'finalize', row = {slug:'example',issue_id:'issue',body_es:'ES'}) {
 const dir=mkdtempSync(join(tmpdir(),'glossa-finalize-'));
 try {
  const preload=join(dir,'mock.mjs');
  writeFileSync(preload,`globalThis.fetch=async (url,options={})=>{
   if(!options.method)return Response.json([${JSON.stringify(row)}]);
   const body=JSON.parse(options.body);console.log('WRITE',url.includes('glossa_issues')?'issue':body.state);
   if(url.includes('glossa_issues'))return new Response(${JSON.stringify(issueResponse.body)},{status:${issueResponse.status},headers:{'Content-Type':'application/json'}});
   return Response.json([{}]);
  };`);
  return spawnSync(process.execPath,['--import',preload,resolve('scripts/publish_from_supabase.mjs'),cmd,'00000000-0000-4000-8000-000000000001','test-sha'],{
   encoding:'utf8',env:{...process.env,SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_KEY:'fake-test-key'}});
 } finally {rmSync(dir,{recursive:true,force:true});}
}

test('an issue write failure cannot leave a successful publication receipt',()=>{
 const r=finalize({status:503,body:'unavailable'});
 assert.equal(r.status,1);assert.doesNotMatch(r.stdout,/WRITE done/);
});
test('an empty issue update is not confirmation',()=>{
 const r=finalize({status:200,body:'[]'});
 assert.equal(r.status,1);assert.doesNotMatch(r.stdout,/WRITE done/);
});
test('done is written after the confirmed issue update',()=>{
 const r=finalize({status:200,body:'[{"id":"issue"}]'});
 assert.equal(r.status,0,r.stderr);
 assert.ok(r.stdout.indexOf('WRITE issue')<r.stdout.indexOf('WRITE done'));
});

test('a duplicate preparation leaves a completed publication untouched',()=>{
 const r=finalize({status:200,body:'[]'},'prepare',{state:'done'});
 assert.equal(r.status,0,r.stderr);
 assert.doesNotMatch(r.stdout,/WRITE/);
 assert.match(r.stdout,/already done/);
});
