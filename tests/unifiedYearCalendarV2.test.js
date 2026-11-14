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
 assert.doesNotMatch(html,/class="period-span"/);
 assert.match(html,/data-period-id="c"/);
 assert.match(html,/data-period-id="d"/);
});

test('Королёва: при соседних переходящих отпусках дни не дублируются',()=>{
 const html=renderUnifiedYearTable(buildUnifiedYearView(2027,[
  rec('feb-mar','2027-02-15','2027-03-01'),
  rec('mar-apr','2027-03-29','2027-04-09')
 ],staff));
 assert.doesNotMatch(html,/colspan="2" class="period-span"/);
 assert.match(html,/15\.02\.27 – 01\.03\.27/);
 assert.match(html,/29\.03\.27 – 09\.04\.27/);
 assert.match(html,/↳ до 01\.03\.27/);
 assert.match(html,/↳ до 09\.04\.27/);
 assert.equal((html.match(/15 дн\./g)||[]).length,1);
 assert.equal((html.match(/12 дн\./g)||[]).length,1);
});
