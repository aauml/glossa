import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const script=readFileSync('src/components/RecordarIdioma.astro','utf8').split('<script is:inline define:vars={{ lang }}>')[1].split('</script>')[0];
test('an explicit thesis collection keeps its language and filter despite another saved language',()=>{
 const redirects=[];runInNewContext(script,{lang:'es',localStorage:{getItem:()=> 'en'},location:{hash:'#tesis',replace:p=>redirects.push(p)}});assert.deepEqual(redirects,[]);
});
test('an ordinary home visit still uses the saved language',()=>{
 const redirects=[];runInNewContext(script,{lang:'en',localStorage:{getItem:()=> 'es'},location:{hash:'',replace:p=>redirects.push(p)}});assert.deepEqual(redirects,['/es/']);
});
