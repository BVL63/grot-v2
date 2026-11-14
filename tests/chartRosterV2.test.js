import test from 'node:test';
import assert from 'node:assert/strict';
import {saveChart,staffInChart,validateCharts,chartMemberIdsByStructure} from '../src/chartRosterV2.js';
import {makeLocalDraft,parseLocalDraft} from '../src/localDraftV2.js';
import {inspectPreviewImport} from '../src/previewImportV2.js';
const staff=[
 {id:'1',name:'Иванов',structureId:'garage'},
 {id:'2',name:'Петров',structureId:'office'},
 {id:'3',name:'Сидорова',structureId:'other'}
];
const structure=[
 {id:'org',name:'Поликлиника',parentId:null},
 {id:'garage',name:'Гараж',parentId:'org'},
 {id:'office',name:'Регистратура',parentId:'org'},
 {id:'other',name:'Отделение',parentId:'org'}
];
const records=[{id:'a',staffId:'1',year:2027,period:{start:'2027-06-01',end:'2027-06-14'}},
 {id:'b',staffId:'2',year:2027,period:{start:'2027-09-01',end:'2027-09-10'}},
 {id:'c',staffId:'3',year:2027,period:{start:'2027-07-01',end:'2027-07-14'}}];
test('График включает людей из разных отделов, не копируя отпусков',()=>{
 const charts=saveChart([],{id:'mixed',name:'Совместный',year:2027,staffIds:['1','3']},staff);
 const chosen=staffInChart(staff,records,charts,'mixed',2027);
 assert.deepEqual(chosen.staff.map(p=>p.id),['1','3']);
 assert.deepEqual(chosen.records.map(r=>r.id),['a','c']);
 assert.equal(staffInChart(staff,records,charts,'',2027).staff.length,3);
 assert.equal(records.length,3);
});
test('Состав графика сохраняется с годом и без повторяющихся ID',()=>{
 const chart=saveChart([],{id:'chart',name:'Водители',year:2027,staffIds:['1','1','2']},staff);
 assert.deepEqual(chart[0].staffIds,['1','2']);
 const update=saveChart(chart,{id:'chart',name:'Водители обновлены',year:2027,staffIds:['2','3']},staff);
 assert.equal(update.length,1);
 assert.deepEqual(update[0].staffIds,['2','3']);
 assert.throws(()=>staffInChart(staff,records,update,'chart',2028),/не найден/);
 assert.throws(()=>saveChart([],{id:'x',year:2027,name:'',staffIds:['1']},staff),/название/);
});
test('Импорт, экспорт и локальная копия сохраняют список графиков',()=>{
 const charts=validateCharts([{id:'m',year:2027,name:'Межотдельский',staffIds:['1','3']}],staff);
 const raw=makeLocalDraft({staff,records,structure,charts,year:2027,source:'Тест',dirty:true});
 assert.deepEqual(parseLocalDraft(raw).charts,charts);
 const data=inspectPreviewImport({schemaVersion:2,staff,records,structure,charts});
 assert.equal(data.ok,true);
 assert.deepEqual(data.charts,charts);
 assert.deepEqual(chartMemberIdsByStructure(staff,structure,'garage'),['1']);
});
