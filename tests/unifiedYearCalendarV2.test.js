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

test('Королёва: переходящие отпуска в одном месяце, но в одной строке',()=>{
 const html=renderUnifiedYearTable(buildUnifiedYearView(2027,[
  rec('feb-mar','2027-02-15','2027-03-01'),
  rec('mar-apr','2027-03-29','2027-04-09'),
  rec('jul-aug','2027-07-26','2027-08-16'),
  rec('oct','2027-10-25','2027-10-29')
 ],staff));
 assert.equal((html.match(/<tr class="vacation-lane/g)||[]).length,1);
 assert.match(html,/colspan="3" class="shared-months-cell"/);
 assert.equal((html.match(/class="vacation-period shared-period"/g)||[]).length,2);
 assert.match(html,/15\.02\.27 – 01\.03\.27/);
 assert.match(html,/29\.03\.27 – 09\.04\.27/);
 assert.equal((html.match(/14 дн\./g)||[]).length,1);
 assert.equal((html.match(/12 дн\./g)||[]).length,1);
 for(const id of ['feb-mar','mar-apr','jul-aug','oct'])
  assert.equal((html.match(new RegExp('data-period-id="'+id+'"','g'))||[]).length,1);
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
 assert.match(html,/class="proportional-fill"[^>]*--bar-left:48\.3333%;--bar-right:6\.4516%/);
 assert.match(html,/30\.04\.27 – 27\.05\.27/);
 assert.match(html,/class="proportional-fill"[^>]*>[\s\S]*30\.04\.27 – 27\.05\.27[\s\S]*<strong>26 дн\.<\/strong><\/span>/);
});
test('Для перехода через три месяца полоса учитывает ширину каждого месяца',()=>{
 const o=proportionalMonthOffsets('2027-01-16','2027-03-15',3);
 assert.ok(Math.abs(o.left-16.129)<0.001);
 assert.ok(Math.abs(o.right-17.2043)<0.001);
});

test('У переходящих отпусков есть обе формы дат: в строку и в три строки',()=>{
 const html=renderUnifiedYearTable(buildUnifiedYearView(2027,[
  rec('short','2027-04-30','2027-05-02'),
  rec('long','2027-08-01','2027-09-20')
 ],staff));
 assert.match(html,/class="period-date-wide">30\.04\.27 – 02\.05\.27/);
 assert.match(html,/class="period-date-narrow"><span>30\.04\.27<\/span><span>02\.05\.27<\/span>/);
 assert.match(html,/class="period-date-wide">01\.08\.27 – 20\.09\.27/);
 assert.equal((html.match(/data-period-id="/g)||[]).length,2);
});

import {calculateYearTotals} from '../src/unifiedYearTableV2.js';
test('Итоговый столбец: дни, итоговая строка: число сотрудников по месяцам',()=>{
 const people=[{id:'1',name:'Иванов И.И.'},{id:'2',name:'Петров П.П.'},{id:'3',name:'Сидоров С.С.'}];
 const items=[
  rec('a','2027-04-30','2027-05-03'),
  {id:'b',year:2027,staffId:'2',period:{start:'2027-05-10',end:'2027-05-14'}},
  {id:'c',year:2026,staffId:'3',period:{start:'2026-05-01',end:'2026-05-10'}}
 ];
 const view=buildUnifiedYearView(2027,items,people);
 const totals=calculateYearTotals(view);
 assert.equal(totals.months[3],1);
 assert.equal(totals.months[4],2); // Иванов и Петров, независимо от числа дней
 assert.equal(totals.total,8);
 assert.deepEqual(totals.byStaff.map(p=>p.total),[3,5,0]);
 const html=renderUnifiedYearTable(view);
 assert.match(html,/Всего дней/);
 assert.match(html,/<tr class="year-totals-row"><th scope="row"[^>]*>В отпуске, чел\.<\/th>/);
 assert.match(html,/<td class="year-grand-total"[^>]*>8<\/td>/);
 assert.equal((html.match(/class="employee-year-total"/g)||[]).length,3);
});
test('Итог за сотрудника выводится один раз при двух дорожках отпусков',()=>{
 const view=buildUnifiedYearView(2027,[rec('one','2027-06-01','2027-07-10'),rec('two','2027-07-11','2027-08-15')],staff);
 const html=renderUnifiedYearTable(view);
 assert.match(html,/rowspan="2"/);
 assert.equal((html.match(/class="employee-year-total"/g)||[]).length,1);
 assert.equal(calculateYearTotals(view).total,75);
});

test('Два отпуска одного сотрудника в месяце считаются одним человеком',()=>{
 const people=[{id:'1',name:'Иванов И.И.'},{id:'2',name:'Петров П.П.'}];
 const items=[
  rec('first','2027-06-01','2027-06-05'),
  rec('second','2027-06-20','2027-06-25'),
  {id:'third',year:2027,staffId:'2',period:{start:'2027-06-10',end:'2027-06-14'}}
 ];
 const totals=calculateYearTotals(buildUnifiedYearView(2027,items,people));
 assert.equal(totals.months[5],2);
 assert.deepEqual(totals.byStaff.map(p=>p.total),[11,4]);
 assert.equal(totals.total,15);
});
test('Переходящий отпуск учитывает сотрудника в обоих месяцах',()=>{
 const totals=calculateYearTotals(buildUnifiedYearView(2027,[rec('a','2027-04-30','2027-05-03')],staff));
 assert.equal(totals.months[3],1);
 assert.equal(totals.months[4],1);
 assert.equal(totals.total,3);
});
