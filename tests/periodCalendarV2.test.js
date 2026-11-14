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

import {vacationDays,endDateForDays,isVacationHoliday} from '../src/periodCalendarV2.js';
test('Ввод дней автоматически рассчитывает конец отпуска',()=>{
 assert.equal(endDateForDays('2027-02-08',12),'2027-02-19');
 assert.equal(endDateForDays('2027-02-15',14),'2027-03-01');
 assert.equal(vacationDays('2027-02-15','2027-03-01'),14);
 assert.equal(endDateForDays('2027-12-28',14),'2028-01-18');
});
test('Праздники исключаются, обычные выходные учитываются',()=>{
 assert.equal(isVacationHoliday('2027-02-23'),true);
 assert.equal(isVacationHoliday('2027-02-22'),false);
 assert.equal(vacationDays('2027-02-20','2027-02-24'),4);
 assert.equal(endDateForDays('2027-02-20',4),'2027-02-24');
});
test('Недопустимое число дней не приводит к неверной дате',()=>{
 assert.throws(()=>endDateForDays('2027-02-01',0));
 assert.throws(()=>endDateForDays('2027-02-01',-2));
 assert.throws(()=>endDateForDays('',12));
});
