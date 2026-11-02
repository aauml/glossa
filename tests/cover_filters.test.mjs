import test from 'node:test';
import assert from 'node:assert/strict';
import {initCollectionFilters} from '../src/lib/cover_filters.js';
import {trackLabel,thesisCollectionUrl} from '../src/lib/tracks.js';
function element(dataset){return {dataset,hidden:false,attributes:{},classList:{toggle(){}},setAttribute(k,v){this.attributes[k]=v;},addEventListener(_,fn){this.click=fn;}};}
function fixture(hash=''){
 const buttons=[element({t:'all'}),element({track:'thesis'}),element({t:'AI'})];
 const cards=[element({track:'thesis',topics:'AI|Risk'}),element({track:'general',topics:'AI'}),element({track:'thesis',topics:'Law'})];
 const empty={hidden:true};const count={dataset:{one:'pieza',many:'piezas'},textContent:''};const supplements=[{hidden:false},{hidden:false}];const location={hash,pathname:'/es/',search:''};const changes=[];
 const history={replaceState(_,__,url){changes.push(url);location.hash=url.includes('#')?'#'+url.split('#')[1]:'';}};
 const root={querySelectorAll:s=>s.includes('.cover-filter')?buttons:s.includes('.article-card')?cards:supplements,querySelector:s=>s==='.cover-count'?count:empty};
 initCollectionFilters(root,location,history);return {buttons,cards,empty,changes,count,supplements};
}
test('thesis is a collection independent of subject and all restores every card',()=>{
 const f=fixture();f.buttons[1].click();assert.deepEqual(f.cards.map(c=>c.hidden),[false,true,false]);assert.equal(f.buttons[1].attributes['aria-pressed'],'true');assert.deepEqual(f.changes,['/es/#tesis']);assert.equal(f.count.textContent,'2 piezas');assert.ok(f.supplements.every(x=>x.hidden));
 f.buttons[0].click();assert.deepEqual(f.cards.map(c=>c.hidden),[false,false,false]);assert.equal(f.changes.at(-1),'/es/');assert.ok(f.supplements.every(x=>!x.hidden));
});
test('a shared thesis link selects the collection; topic filters still include other collections',()=>{
 const f=fixture('#tesis');assert.deepEqual(f.cards.map(c=>c.hidden),[false,true,false]);assert.deepEqual(f.changes,[]);
 f.buttons[2].click();assert.deepEqual(f.cards.map(c=>c.hidden),[false,false,true]);assert.equal(f.changes.at(-1),'/es/');
});
test('the collection label and article link follow the reading language',()=>{
 assert.equal(trackLabel('thesis','es'),'Tesis');assert.equal(trackLabel('thesis','en'),'Thesis');assert.equal(thesisCollectionUrl('es'),'/es/#tesis');assert.equal(thesisCollectionUrl('en'),'/#tesis');assert.equal(trackLabel('general'),'');
});
