import test from 'node:test';
import assert from 'node:assert/strict';
import {validateStructure,structureRows,structurePath,staffForStructure,upsertStructure,upsertStaff} from '../src/organizationDirectoryV2.js';
import {inspectPreviewImport} from '../src/previewImportV2.js';
import {makeLocalDraft,parseLocalDraft} from '../src/localDraftV2.js';
const structure=[{id:'org',name:'Организация',code:'01',parentId:null,type:'organization'},
 {id:'div',name:'Подразделение 2',code:'01.02',parentId:'org',type:'division'},
 {id:'dep',name:'Регистратура',code:'01.02.01',parentId:'div',type:'brigade'}];
const staff=[{id:12,name:'Иванов',lastName:'Иванов',structureId:'dep',allowance:36}];
test('Структура сохраняет иерархию и не меняет оригинал',()=>{
 const verified=validateStructure(structure);
 assert.deepEqual(structureRows(verified).map(x=>x.depth),[0,1,2]);
 assert.equal(structurePath(structure,'dep'),'Организация → Подразделение 2 → Регистратура');
 assert.equal(staffForStructure(staff,structure,'div').length,1);
 assert.equal(verified.length,3);
});
test('Нельзя создать циклическую структуру',()=>{
 assert.throws(()=>upsertStructure(structure,{...structure[0],parentId:'dep'}),/циклическая/);
});
test('Редактирование сотрудника сохраняет неизвестные поля',()=>{
 const updated=upsertStaff([{...staff[0],leaveByYear:{2027:{basic:28}}}],{...staff[0],position:'Регистратор'});
 assert.equal(updated[0].leaveByYear[2027].basic,28);
 assert.equal(updated[0].position,'Регистратор');
});
test('Структура переживает экспорт, импорт и перезагрузку',()=>{
 const sample={schemaVersion:2,staff,records:[],structure};
 const imported=inspectPreviewImport(sample);
 assert.equal(imported.ok,true);
 assert.deepEqual(imported.structure,structure);
 const raw=makeLocalDraft({...sample,year:2027,source:'Тест',dirty:true});
 assert.deepEqual(parseLocalDraft(raw).structure,structure);
});

import {unassignedStaff,assignStaffToStructure} from '../src/organizationDirectoryV2.js';
test('Не привязанные к структуре сотрудники выявляются, включая уволенных',()=>{
 const people=[...staff,{id:18,name:'Воликов Р.И.',department:'Хозяйственный отдел',audit:[{reason:'История'}],allowance:36},
 {id:17,name:'Седякин О.С.',structureId:'missing',dismissed:false},
 {id:14,name:'Ломов В.В.',dismissed:true}];
 assert.deepEqual(unassignedStaff(people,structure).map(x=>x.id),[18,17,14]);
 assert.deepEqual(unassignedStaff(people,structure,{includeDismissed:false}).map(x=>x.id),[18,17]);
});
test('Массовая привязка не меняет отпуска, группы и историю',()=>{
 const people=[...staff,{id:18,name:'Воликов Р.И.',department:'Хозяйственный отдел',group:'2',audit:[{reason:'История'}],allowance:36},
 {id:17,name:'Седякин О.С.',department:'Гараж',group:'1',allowance:36}];
 const result=assignStaffToStructure(people,structure,[18],'div');
 assert.equal(result.find(x=>x.id===18).structureId,'div');
 assert.equal(result.find(x=>x.id===18).department,'Организация → Подразделение 2');
 assert.equal(result.find(x=>x.id===18).audit[0].reason,'История');
 assert.equal(result.find(x=>x.id===18).group,'2');
 assert.equal(result.find(x=>x.id===17).structureId,undefined);
 assert.equal(people.find(x=>x.id===18).structureId,undefined);
 assert.throws(()=>assignStaffToStructure(people,structure,[18],'unknown'),/Подразделение/);
});

test('Начальник отдела включается в состав автоматически и не дублируется',()=>{
 const nodes=[
  {id:'root',name:'Поликлиника',parentId:null},
  {id:'division',name:'Подразделение № 2',parentId:'root'},
  {id:'office',name:'Хозяйственный отдел',parentId:'division',leaderId:'18'},
  {id:'drivers',name:'Водители',parentId:'office'}
 ];
 const people=[
  {id:18,name:'Воликов Р.И.',department:'Хозяйственный отдел'},
  {id:4,name:'Бахметьев В.Л.',structureId:'drivers'},
  {id:5,name:'Винник Д.В.',structureId:'drivers'}
 ];
 assert.deepEqual(staffForStructure(people,nodes,'office').map(x=>x.id),[18,4,5]);
 assert.equal(staffForStructure(people,nodes,'division').length,3);
 assert.equal(staffForStructure(people,nodes,'root').length,3);
 assert.equal(unassignedStaff(people,nodes).length,0);
 const assigned=[{...people[0],structureId:'office'},...people.slice(1)];
 assert.equal(staffForStructure(assigned,nodes,'office').length,3);
 assert.equal(people[0].structureId,undefined);
});
