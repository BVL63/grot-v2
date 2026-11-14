import test from 'node:test';
import assert from 'node:assert/strict';
import {shiftMonth,renderRangeCalendar,inclusiveCalendarDays} from '../src/periodCalendarV2.js';

test('Переход с декабря на январь',()=>{
 assert.equal(shiftMonth('2026-12',1),'2027-01');
 assert.equal(shiftMonth('2027-01',-1),'2026-12');
});
test('Выбранный период отображается на двух месяцах',()=>{
 const html=renderRangeCalendar('2027-02-15','2027-03-01','2027-02');
 assert.match(html,/Февраль 2027/);
 assert.match(html,/Март 2027/);
 assert.match(html,/data-calendar-day="2027-02-15" aria-label="2027-02-15, Начало отпуска"/);
 assert.match(html,/data-calendar-day="2027-03-01" aria-label="2027-03-01, Конец отпуска"/);
 assert.equal(inclusiveCalendarDays('2027-02-15','2027-03-01'),15);
});
test('Переходящий отпуск с одной датой отмечает обе границы',()=>{
 const html=renderRangeCalendar('2027-06-05','2027-06-05','2027-06');
 assert.match(html,/range-start range-end/);
 assert.equal(inclusiveCalendarDays('2027-06-05','2027-06-05'),1);
});
test('Неполный период не показывает ложное количество дней',()=>{
 assert.equal(inclusiveCalendarDays('2027-06-05',''),0);
 assert.equal(inclusiveCalendarDays('2027-06-10','2027-06-05'),0);
});
