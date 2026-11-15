/**
 * Загружаемые производственные календари.
 * holidays — именно нерабочие праздничные дни (ст. 120 ТК РФ);
 * daysOff — выходные/перенесённые выходные, НЕ исключаемые из отпуска;
 * workingWeekends — рабочие субботы/воскресенья.
 */
const isDate=date=>{
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
 const d=new Date(date+'T12:00:00Z');
 return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===date;
};
const TYPES={holiday:'holidays',holidays:'holidays',праздник:'holidays',праздничный:'holidays',
 dayoff:'daysOff',off:'daysOff',day_off:'daysOff',weekend:'daysOff',выходной:'daysOff',перенос:'daysOff',
 work:'workingWeekends',working:'workingWeekends',workingweekend:'workingWeekends',рабочий:'workingWeekends'};
const FIELDS=['holidays','daysOff','workingWeekends'];
export function validateProductionCalendar(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Нужен календарь в формате JSON');
 const year=Number(input.year);
 if(!Number.isInteger(year)||year<2000||year>2200)throw new Error('Укажите год от 2000 до 2200');
 const obj={year};
 for(const field of FIELDS){
  const raw=input[field]??[];
  if(!Array.isArray(raw))throw new Error('Поле '+field+' должно быть списком дат');
  const dates=[...new Set(raw.map(x=>String(x).trim()))].sort();
  for(const date of dates)
   if(!isDate(date)||Number(date.slice(0,4))!==year)throw new Error('Неверная дата '+date+' в '+field);
  obj[field]=dates;
 }
 const seen=new Set();
 for(const field of FIELDS)for(const d of obj[field]){
  if(seen.has(d))throw new Error('Дата '+d+' одновременно указана в разных категориях');
  seen.add(d);
 }
 if(input.source!=null)obj.source=String(input.source).slice(0,100);
 if(input.loadedAt!=null)obj.loadedAt=String(input.loadedAt).slice(0,40);
 return obj;
}
export function validateProductionCalendars(data){
 if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Неверный набор календарей');
 const result={};
 for(const [year,raw] of Object.entries(data)){
  const value=validateProductionCalendar(raw);
  if(String(value.year)!==String(year))throw new Error('Год календаря не совпадает с ключом');
  result[year]=value;
 }
 return result;
}
const normalizeType=label=>String(label||'').trim().toLocaleLowerCase('ru').replace(/[\s-]+/g,'_');
function parseCsv(text,assumedYear){
 const lines=String(text).replace(/^\uFEFF/,'').split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith('#'));
 const rows=lines.map(x=>x.split(/[;,\t]/).map(v=>v.trim().replace(/^"|"$/g,'')));
 if(rows.length&&/^(date|дата)$/i.test(rows[0][0]))rows.shift();
 const value={year:assumedYear,holidays:[],daysOff:[],workingWeekends:[]};
 for(let i=0;i<rows.length;i++){
  let [date,type]=rows[i];if(!date||!type)throw new Error('Строка '+(i+1)+': нужны дата и тип');
  // CSV допускает дд.мм.гггг для удобства Excel.
  const match=date.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if(match)date=match[3]+'-'+match[2]+'-'+match[1];
  const field=TYPES[normalizeType(type)]||TYPES[normalizeType(type).replace(/_/g,'')];
  if(!field)throw new Error('Неизвестный тип '+type+' в строке '+(i+1));
  value[field].push(date);
 }
 if(!assumedYear){
  const years=[...new Set(rows.map(r=>{const x=r[0];return x.match(/^\d{2}\.\d{2}\.(\d{4})$/)?.[1]||x.slice(0,4);}))];
  if(years.length!==1)throw new Error('CSV должен содержать даты одного года');
  value.year=Number(years[0]);
 }
 return validateProductionCalendar(value);
}
export function parseProductionCalendarFile(text,filename='',year=null){
 const raw=String(text||'').replace(/^\uFEFF/,'').trim();
 if(!raw)throw new Error('Файл пуст');
 if(filename.toLowerCase().endsWith('.csv'))return parseCsv(raw,year);
 let data;
 try{data=JSON.parse(raw);}catch{throw new Error('Неверный JSON. Для таблицы используйте CSV с колонками дата;тип');}
 return validateProductionCalendar(data);
}
/**
 * isdayoff.ru: 0 — рабочий, 1 — выходной, 2 — сокращённый рабочий,
 * 4 — специальный рабочий, 8 — праздник (если поддерживается).
 * Сервис не различает обычные выходные и переносы — федеральные
 * праздники остаются в отдельном статическом наборе ТК РФ.
 */
export function parseIsDayOffYear(raw,year){
 const y=Number(year);
 if(!Number.isInteger(y)||y<2000||y>2200)throw new Error('Недопустимый год');
 const expected=new Date(Date.UTC(y+1,0,1))-new Date(Date.UTC(y,0,1));
 const length=expected/86400000;
 const response=String(raw||'').trim();
 if(response.length!==length||!/^[01248]+$/.test(response))
  throw new Error('Сервис вернул неполный календарь или неизвестный формат');
 const result={year:y,holidays:[],daysOff:[],workingWeekends:[]};
 let totalOff=0;
 for(let i=0;i<response.length;i++){
  const date=new Date(Date.UTC(y,0,1+i)).toISOString().slice(0,10);
  const status=response[i];
  const weekend=[0,6].includes(new Date(date+'T12:00:00Z').getUTCDay());
  if(status==='1'||status==='8'){
   totalOff++;
   if(status==='8')result.holidays.push(date);
   else if(!weekend)result.daysOff.push(date);
  }else if(weekend)result.workingWeekends.push(date);
 }
 // Пустые/предварительные годы нередко возвращаются как календарь без переносов.
 // Проверяем как минимум правдоподобное число выходных и федеральные праздники.
 if(totalOff<90||totalOff>150)throw new Error('Недостоверное число выходных: '+totalOff);
 const knownHolidays=['01-01','01-07','02-23','03-08','05-01','05-09','06-12','11-04'];
 for(const mmdd of knownHolidays){
  const [m,d]=mmdd.split('-').map(Number);
  const index=Math.round((Date.UTC(y,m-1,d)-Date.UTC(y,0,1))/86400000);
  if(!['1','8'].includes(response[index]))throw new Error('Нет федерального праздника '+mmdd+'. Календарь может быть не утверждён');
 }
 // Проверяем известное постановление РФ от 17.09.2026 №1187.
 if(y===2027){
  const statusAt=date=>response[Math.round((Date.parse(date+'T00:00:00Z')-Date.UTC(y,0,1))/86400000)];
  for(const date of ['2027-02-22','2027-11-05','2027-12-31'])
   if(!['1','8'].includes(statusAt(date)))throw new Error('Нет утверждённого переноса '+date);
  if(!['0','2','4'].includes(statusAt('2027-02-20')))
   throw new Error('Не учтён рабочий день 20 февраля 2027 года');
 }
 return validateProductionCalendar(result);
}
export const ISDAYOFF_YEAR_URL=year=>'https://isdayoff.ru/api/getdata?year='+Number(year)+'&cc=ru&pre=1';
export function productionCalendarExample(year){
 return {year:Number(year),holidays:[],daysOff:[],workingWeekends:[]};
}
