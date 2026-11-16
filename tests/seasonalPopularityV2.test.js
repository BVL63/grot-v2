import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMonthlyPopularity,calculateSeasonalPopularity} from '../src/seasonalPopularityV2.js';

test('КСН по согласованной статистике 2027 округлён до 0,1, сумма 12,0',()=>{
 const counts=[5,7,11,20,18,12,22,30,25,14,8,4];
 assert.deepEqual(normalizeMonthlyPopularity(counts),
  [0.3,0.5,0.8,1.4,1.2,0.8,1.5,2.0,1.7,1.0,0.5,0.3]);
});
test('КСН имеет сумму 12,0 в каждом непустом распределении, включая равные месяцы',()=>{
 for(const counts of [Array(12).fill(1),[12,...Array(11).fill(0)],[1,2,3,4,5,6,7,8,9,10,11,12]]){
  const values=normalizeMonthlyPopularity(counts);
  assert.equal(Math.round(values.reduce((a,b)=>a+b,0)*10),120);
  assert.ok(values.every(x=>Number.isInteger(Math.round(x*10))));
 }
});
test('Нет отпусков — нет КСН, вместо выдуманного среднего',()=>{
 assert.equal(normalizeMonthlyPopularity(Array(12).fill(0)),null);
});
test('Один сотрудник с двумя периодами в марте считается единожды; переходящие даты входят в два месяца',()=>{
 const staff=[{id:'1',name:'Тестов Иван'},{id:'2',name:'Другой Иван'}];
 const records=[
  {id:'a',year:2027,staffId:'1',period:{start:'2027-02-26',end:'2027-03-08'}},
  {id:'b',year:2027,staffId:'1',period:{start:'2027-03-20',end:'2027-03-25'}},
  {id:'c',year:2027,staffId:'2',period:{start:'2027-03-10',end:'2027-04-10'}},
  {id:'d',year:2026,staffId:'2',period:{start:'2026-03-10',end:'2026-03-20'}},
  {id:'e',year:2027,staffId:'2',deleted:true,period:{start:'2027-05-10',end:'2027-05-20'}}
 ];
 const result=calculateSeasonalPopularity(2027,records,staff);
 assert.deepEqual(result.counts,[0,1,2,1,0,0,0,0,0,0,0,0]);
 assert.equal(result.totalOccurrences,4);
 assert.equal(result.coefficients.reduce((a,b)=>a+b,0),12);
});
