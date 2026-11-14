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
