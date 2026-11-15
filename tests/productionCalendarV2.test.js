import test from 'node:test';
import assert from 'node:assert/strict';
import {parseProductionCalendarFile,validateProductionCalendar,validateProductionCalendars} from '../src/productionCalendarV2.js';
import {setProductionCalendars,vacationDays,endDateForDays,isVacationHoliday,productionCalendarDay,renderRangeCalendar} from '../src/periodCalendarV2.js';
import {makeLocalDraft,parseLocalDraft} from '../src/localDraftV2.js';
test('CSV загружает календарь по году и отделяет праздничные дни от перенесённых',()=>{
 const data=parseProductionCalendarFile('дата;тип\n05.05.2027;выходной\n09.05.2027;праздник\n06.11.2027;рабочий','production.csv',2027);
 assert.deepEqual(data,{year:2027,holidays:['2027-05-09'],daysOff:['2027-05-05'],workingWeekends:['2027-11-06']});
});
test('Праздники исключаются из отпуска, дополнительные выходные не исключаются',()=>{
 try{
  setProductionCalendars({2027:validateProductionCalendar({year:2027,holidays:['2027-04-15'],daysOff:['2027-04-16'],workingWeekends:['2027-04-17']})});
  assert.equal(isVacationHoliday('2027-04-15'),true);
  assert.equal(vacationDays('2027-04-14','2027-04-17'),3);
  assert.equal(endDateForDays('2027-04-14',3),'2027-04-17');
  assert.equal(productionCalendarDay('2027-04-16').dayOff,true);
  assert.equal(productionCalendarDay('2027-04-17').workingWeekend,true);
  assert.match(renderRangeCalendar('','','2027-04'),/calendar-holiday/);
  assert.match(renderRangeCalendar('','','2027-04'),/calendar-day-off/);
 }finally{setProductionCalendars({});}
});
test('Неверные даты и пересекающиеся типы отклоняются',()=>{
 assert.throws(()=>parseProductionCalendarFile('дата;тип\n31.02.2027;праздник','c.csv',2027),/Неверная дата/);
 assert.throws(()=>validateProductionCalendar({year:2027,holidays:['2026-01-01']}),/Неверная дата/);
 assert.throws(()=>validateProductionCalendar({year:2027,holidays:['2027-01-10'],daysOff:['2027-01-10']}),/одновременно/);
 assert.throws(()=>parseProductionCalendarFile('дата;тип\n01.04.2027;непонятно','c.csv',2027),/Неизвестный тип/);
});
test('Пользовательский календарь сохраняется в резервной локальной копии',()=>{
 const cal=validateProductionCalendars({2027:{year:2027,holidays:['2027-04-15'],daysOff:[],workingWeekends:[]}});
 const raw=makeLocalDraft({staff:[],records:[],structure:[],charts:[],productionCalendars:cal,year:2027,source:'тест',dirty:true});
 const back=parseLocalDraft(raw);
 assert.deepEqual(back.productionCalendars,cal);
});
test('Базовые федеральные праздники остаются без загруженного файла',()=>{
 setProductionCalendars({});
 assert.equal(isVacationHoliday('2027-01-01'),true);
 assert.equal(isVacationHoliday('2027-02-23'),true);
 assert.equal(isVacationHoliday('2027-04-15'),false);
});
