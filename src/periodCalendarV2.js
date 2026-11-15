/** Inline two-month vacation range calendar (Monday first, ISO local dates). */
const MONTHS=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const DAYS=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
export const validIsoDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&!Number.isNaN(Date.parse(s+'T12:00:00Z'));
export function shiftMonth(anchor,delta){
 const [y,m]=anchor.split('-').map(Number);
 const d=new Date(Date.UTC(y,m-1+delta,1));
 return d.toISOString().slice(0,7);
}

/** Ст. 112, 120 ТК РФ: праздничные дни не учитываются в длительности отпуска.
 * Перенесённые выходные остаются календарными днями отпуска.
 */
const RF_HOLIDAYS=new Set([
 '01-01','01-02','01-03','01-04','01-05','01-06','01-07','01-08',
 '02-23','03-08','05-01','05-09','06-12','11-04'
]);
let importedCalendars={};
/** Применяет календари из текущей копии данных, без сетевого доступа. */
export function setProductionCalendars(calendars={}){
 importedCalendars=calendars;
}
export function productionCalendarDay(iso){
 if(!validIsoDate(iso))return {holiday:false,dayOff:false,workingWeekend:false};
 const cal=importedCalendars[iso.slice(0,4)];
 const holiday=RF_HOLIDAYS.has(iso.slice(5))||!!cal?.holidays?.includes(iso);
 const workingWeekend=!!cal?.workingWeekends?.includes(iso);
 const weekend=[0,6].includes(new Date(iso+'T12:00:00Z').getUTCDay());
 return {holiday,workingWeekend,dayOff:!holiday&&!workingWeekend&&(weekend||!!cal?.daysOff?.includes(iso))};
}
export const isVacationHoliday=iso=>productionCalendarDay(iso).holiday;
export function vacationDays(start,end){
 if(!validIsoDate(start)||!validIsoDate(end)||end<start)return 0;
 let count=0;
 const from=Date.parse(start+'T12:00:00Z'),to=Date.parse(end+'T12:00:00Z');
 for(let t=from;t<=to;t+=86400000){
  if(!isVacationHoliday(new Date(t).toISOString().slice(0,10)))count++;
 }
 return count;
}
export function endDateForDays(start,days){
 const count=Number(days);
 if(!validIsoDate(start)||!Number.isInteger(count)||count<1||count>3660)
  throw new RangeError('Укажите начало и количество дней от 1 до 3660');
 let current=Date.parse(start+'T12:00:00Z'),rest=count;
 for(let i=0;i<4000;i++,current+=86400000){
  const date=new Date(current).toISOString().slice(0,10);
  if(!isVacationHoliday(date))rest--;
  if(rest===0)return date;
 }
 throw new RangeError('Период слишком длинный');
}

function renderMonth(anchor,start,end,periods=[]){
 const [y,m]=anchor.split('-').map(Number);
 const first=(new Date(Date.UTC(y,m-1,1)).getUTCDay()+6)%7;
 const count=new Date(Date.UTC(y,m,0)).getUTCDate();
 const weekdays=DAYS.map(x=>'<span class="calendar-weekday">'+x+'</span>').join('');
 const cells=Array.from({length:first},()=>'<span class="calendar-blank"></span>');
 for(let day=1;day<=count;day++){
  const date=anchor+'-'+String(day).padStart(2,'0');
  const classes=['calendar-day'];
  if(periods.some(p=>p?.start<=date&&p?.end>=date))classes.push('year-existing-leave');
  if(start&&end&&date>=start&&date<=end)classes.push('in-range');
  if(date===start)classes.push('range-start');
  if(date===end)classes.push('range-end');
  const productionDay=productionCalendarDay(date);
  if(productionDay.holiday)classes.push('calendar-holiday');
  else if(productionDay.dayOff)classes.push('calendar-day-off');
  else if(productionDay.workingWeekend)classes.push('calendar-work-weekend');
  const aria=date===start&&date===end?'Начало и конец':date===start?'Начало отпуска':date===end?'Конец отпуска':'';
  cells.push('<button type="button" class="'+classes.join(' ')+'" data-calendar-day="'+date+'" aria-label="'+date+(aria?', '+aria:'')+'">'+day+'</button>');
 }
 return '<section class="calendar-month"><h3>'+MONTHS[m-1]+' '+y+'</h3><div class="calendar-days">'+weekdays+cells.join('')+'</div></section>';
}
export function renderRangeCalendar(start,end,anchor){
 if(!/^\d{4}-\d{2}$/.test(anchor||''))throw new Error('Неверный месяц календаря');
 return renderMonth(anchor,start,end)+renderMonth(shiftMonth(anchor,1),start,end);
}
export function inclusiveCalendarDays(start,end){
 if(!validIsoDate(start)||!validIsoDate(end)||end<start)return 0;
 const a=Date.parse(start+'T12:00:00Z'),b=Date.parse(end+'T12:00:00Z');
 return Math.round((b-a)/86400000)+1;
}

/** Годовая сетка отпусков: 12 месяцев с подсветкой всех периодов сотрудника. */
export function renderYearVacationCalendar(year,start,end,periods=[]){
 if(!Number.isInteger(Number(year))||Number(year)<1900||Number(year)>2200)throw new RangeError('Неверный год');
 return Array.from({length:12},(_,m)=>renderMonth(String(year)+'-'+String(m+1).padStart(2,'0'),start,end,periods)).join('');
}
