import test from 'node:test';
import assert from 'node:assert/strict';
import {buildUnifiedYearView,renderUnifiedYearTable} from '../src/unifiedYearTableV2.js';
const staff=[{id:'1',name:'Иванов И.И.'}];
const rec=(id,start,end)=>({id,year:2027,staffId:'1',staffName:'Иванов И.И.',period:{start,end}});
test('В одном месяце начало, конец и дни идут вертикально',()=>{
 const html=renderUnifiedYearTable(buildUnifiedYearView(2027,[rec('a','2027-06-15','2027-06-28')],staff));
 assert.match(html,/single-month/);
 assert.match(html,/<span>15\.06\.27<\/span><span>28\.06\.27<\/span><strong>14 дн\.<\/strong>/);
});
test('Переход из июня в июль объединяет соседние месяцы',()=>{
 const html=renderUnifiedYearTable(buildUnifiedYearView(2027,[rec('b','2027-06-25','2027-07-10')],staff));
 assert.match(html,/colspan="2" class="period-span"/);
 assert.match(html,/25\.06\.27 – 10\.07\.27/);
 assert.match(html,/16 дн\./);
});
test('Нельзя скрывать второй период объединённой ячейкой',()=>{
 const html=renderUnifiedYearTable(buildUnifiedYearView(2027,[
  rec('c','2027-06-25','2027-07-10'),rec('d','2027-07-20','2027-07-25')],staff));
 assert.match(html,/colspan="2" class="period-span"/);
 assert.equal((html.match(/data-period-id="c"/g)||[]).length,1);
 assert.match(html,/rowspan="2"/);
 assert.match(html,/data-period-id="c"/);
 assert.match(html,/data-period-id="d"/);
});

test('Королёва: при соседних переходящих отпусках дни не дублируются',()=>{
 const html=renderUnifiedYearTable(buildUnifiedYearView(2027,[
  rec('feb-mar','2027-02-15','2027-03-01'),
  rec('mar-apr','2027-03-29','2027-04-09')
 ],staff));
 assert.equal((html.match(/colspan="2" class="period-span"/g)||[]).length,2);
 assert.match(html,/rowspan="2"/);
 assert.match(html,/15\.02\.27 – 01\.03\.27/);
 assert.match(html,/29\.03\.27 – 09\.04\.27/);
  assert.equal((html.match(/14 дн\./g)||[]).length,1);
 assert.equal((html.match(/12 дн\./g)||[]).length,1);
});

import {shortStaffName} from '../src/unifiedYearTableV2.js';
test('График показывает Фамилия И.О., справочник не меняется',()=>{
 const employee={id:42,lastName:'Королева',firstName:'Ангелина',middleName:'Сергеевна',name:'Королева Ангелина Сергеевна'};
 const before=structuredClone(employee);
 const html=renderUnifiedYearTable(buildUnifiedYearView(2027,[],[employee]));
 assert.match(html,/>Королева А\.С\.<\/th>/);
 assert.match(html,/title="Королева Ангелина Сергеевна"/);
 assert.deepEqual(employee,before);
});
test('Сокращение имён при смешанных исторических форматах',()=>{
 assert.equal(shortStaffName({name:'Бахметьев В.Л.',lastName:'Бахметьев',firstName:'Владимир',middleName:'Леонидович'}),'Бахметьев В.Л.');
 assert.equal(shortStaffName({name:'Иванов Иван Иванович'}),'Иванов И.И.');
 assert.equal(shortStaffName({name:'Петров П.П.'}),'Петров П.П.');
 assert.equal(shortStaffName({name:'Сидорюк Виктория'}),'Сидорюк В.');
});

import {proportionalMonthOffsets} from '../src/unifiedYearTableV2.js';
test('Переходящий отпуск показывает пропорции календарных месяцев',()=>{
 const off=proportionalMonthOffsets('2027-04-30','2027-05-27',2);
 assert.ok(Math.abs(off.left-48.3333)<0.001);
 assert.ok(Math.abs(off.right-6.4516)<0.001);
 const html=renderUnifiedYearTable(buildUnifiedYearView(2027,[rec('x','2027-04-30','2027-05-27')],staff));
 assert.match(html,/proportional-period/);
 assert.match(html,/class="proportional-fill"[^>]*left:48\.3333%;right:6\.4516%/);
 assert.match(html,/30\.04\.27 – 27\.05\.27/);
 assert.match(html,/26 дн\./);
});
test('Для перехода через три месяца полоса учитывает ширину каждого месяца',()=>{
 const o=proportionalMonthOffsets('2027-01-16','2027-03-15',3);
 assert.ok(Math.abs(o.left-16.129)<0.001);
 assert.ok(Math.abs(o.right-17.2043)<0.001);
});
