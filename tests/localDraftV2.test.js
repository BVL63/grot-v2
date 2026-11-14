import test from 'node:test';
import assert from 'node:assert/strict';
import {makeLocalDraft,parseLocalDraft,DRAFT_KEY} from '../src/localDraftV2.js';
const example={
 staff:[{id:4,name:'Бахметьев В.Л.'}],
 records:[{id:'2027-1',year:2027,staffId:'4',period:{start:'2027-02-08',end:'2027-02-19'},audit:[]},
 {id:'2026-old',year:2026,staffId:'4',period:{start:'2026-03-16',end:'2026-03-26'},deleted:true,audit:[{field:'deleted',reason:'Корректировка'}]}],
 year:2026,source:'Сохраненный файл',dirty:true
};
test('Автосохранение восстанавливает все годы, изменения и удалённые записи',()=>{
 const restored=parseLocalDraft(makeLocalDraft(example));
 assert.deepEqual(restored.staff,example.staff);
 assert.deepEqual(restored.records,example.records);
 assert.equal(restored.year,2026);
 assert.equal(restored.dirty,true);
 assert.match(DRAFT_KEY,/grot-v2/);
});
test('Повреждённые и чужие данные не восстанавливаются',()=>{
 assert.equal(parseLocalDraft('broken'),null);
 assert.equal(parseLocalDraft('{"records":[]}'),null);
 const broken=JSON.parse(makeLocalDraft(example));
 broken.records[0].period.start='2027-02-30';
 assert.equal(parseLocalDraft(JSON.stringify(broken)),null);
});
